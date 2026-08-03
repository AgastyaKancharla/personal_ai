import express, { Request, Response } from 'express';
import { CitationAuditAgent } from './index';
import { NAPAuditReport, SourceOfTruthNAP } from './types/nap';
import { NAPReporter } from './reports/reporter';
import { getAllDirectoryProviders } from './directories';
import { getDirectoryCatalog } from './directories/catalog';
import { BrowserFactory } from './utils/browser';
import { NAPNormalizer } from './engine/normalizer';
import { CONFIG } from './config/env';
import { discover } from './discovery/orchestrator';
import { BusinessCluster, clusterCandidates } from './discovery/clustering';
import { enrichCandidateCoordinates, enrichQueryCoordinates } from './discovery/geocoding';
import { getSupabaseClient } from './db/supabase';
import { encrypt } from './writeback/crypto';
import { checkPassword, createSessionToken, parseCookies, SESSION_COOKIE, SESSION_TTL_MS, verifySessionToken } from './auth/session';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Every route below is an internal operator tool that can trigger scrapes and,
// via /api/audit/approve, queue real writes to a client's live Google Business
// Profile. Gate everything behind a login page once INTERNAL_APP_PASSWORD is
// set. Shared, publicly-linkable client report pages (/report/:id) are the one
// deliberate exception — their access control is the unguessable report id,
// not the operator session, since the recipient is the client, not the agency.
const PUBLIC_PATHS = new Set(['/login', '/api/health', '/health']);
app.use((req: Request, res: Response, next) => {
  if (!CONFIG.INTERNAL_APP_PASSWORD) return next();
  if (PUBLIC_PATHS.has(req.path) || req.path.startsWith('/report/')) return next();
  const cookies = parseCookies(req.headers.cookie);
  if (verifySessionToken(cookies[SESSION_COOKIE])) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sign in required.' });
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
});

app.get('/login', (req: Request, res: Response) => {
  if (!CONFIG.INTERNAL_APP_PASSWORD) return res.redirect('/');
  res.send(getLoginHTML({ error: req.query.error === '1', next: typeof req.query.next === 'string' ? req.query.next : '/' }));
});

app.post('/login', (req: Request, res: Response) => {
  const { password, next: nextPath } = req.body;
  const safeNext = typeof nextPath === 'string' && nextPath.startsWith('/') ? nextPath : '/';
  if (!checkPassword(String(password || ''))) return res.redirect(`/login?error=1&next=${encodeURIComponent(safeNext)}`);
  res.cookie(SESSION_COOKIE, createSessionToken(), { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: SESSION_TTL_MS });
  res.redirect(safeNext);
});

app.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE);
  res.redirect('/login');
});

interface DiscoveredBusiness {
  id: string;
  businessName: string;
  address: string;
  searchUrl: string;
  directoryName: string;
  domain: string;
  confidence: number;
  matchReason: string;
  source?: 'places_api' | 'maps_page' | 'google_search' | 'openstreetmap';
  phone?: string;
  website?: string;
  matchedSources?: string[];
}

interface DiscoveryResult {
  candidates: DiscoveredBusiness[];
  clusters?: BusinessCluster[];
  diagnostics: string[];
}

interface OpenStreetMapPlace {
  osm_type?: 'node' | 'way' | 'relation';
  osm_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  namedetails?: { name?: string };
  address?: Record<string, string>;
  extratags?: Record<string, string>;
  type?: string;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

let nextNominatimRequestAt = 0;
const nominatimCache = new Map<string, { expiresAt: number; places: OpenStreetMapPlace[] }>();

const CITY_ALIASES: Record<string, string[]> = {
  bangalore: ['Bengaluru'],
  bengaluru: ['Bangalore']
};

const COMMON_QUERY_TYPOS: Record<string, string> = {
  elevatos: 'elevators',
  elevetor: 'elevator',
  resturant: 'restaurant',
  clininc: 'clinic',
  hosptial: 'hospital',
  saloon: 'salon'
};

function cleanQueryText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function correctCommonTypos(value: string): string {
  return value.replace(/\b[a-z]+\b/gi, (word) => COMMON_QUERY_TYPOS[word.toLowerCase()] || word);
}

function buildSearchQueries(input: Record<string, string | undefined>): string[] {
  const name = cleanQueryText(input.businessName || '');
  const city = cleanQueryText(input.city || '');
  const address = cleanQueryText(input.address || '');
  const category = cleanQueryText(input.category || '');
  const identifier = cleanQueryText(input.phone || input.website || '');
  const queries = new Set<string>();
  const add = (...parts: string[]) => {
    const query = cleanQueryText(parts.filter(Boolean).join(' '));
    if (query) queries.add(query);
  };

  // Preserve the customer's wording, then try a small, transparent set of useful variations.
  add(name, category, address, city);
  add(name, city);
  const correctedName = correctCommonTypos(name);
  const correctedCategory = correctCommonTypos(category);
  add(correctedName, correctedCategory, city);
  if (city) {
    const aliases = CITY_ALIASES[city.toLowerCase()] || [];
    aliases.forEach((alias) => add(correctedName || name, correctedCategory || category, alias));
  }
  if (identifier) add(identifier);

  return [...queries].slice(0, 5);
}

function legacyScoreCandidate(candidate: Pick<DiscoveredBusiness, 'businessName' | 'address'>, input: Record<string, string | undefined>): Pick<DiscoveredBusiness, 'confidence' | 'matchReason'> {
  const requestedName = NAPNormalizer.normalizeBusinessName(input.businessName || '');
  const candidateName = NAPNormalizer.normalizeBusinessName(candidate.businessName);
  const nameScore = requestedName ? NAPNormalizer.calculateSimilarity(requestedName, candidateName) : 50;
  const requestedCity = (input.city || '').toLowerCase();
  const candidateAddress = candidate.address.toLowerCase();
  const cityAlternatives = [requestedCity, ...(CITY_ALIASES[requestedCity] || []).map((city) => city.toLowerCase())].filter(Boolean);
  const locationMatch = cityAlternatives.some((city) => candidateAddress.includes(city));
  const requestedAddress = NAPNormalizer.normalizeAddress(input.address || '');
  const addressScore = requestedAddress && candidate.address
    ? NAPNormalizer.calculateSimilarity(requestedAddress, NAPNormalizer.normalizeAddress(candidate.address))
    : 0;
  const confidence = Math.min(99, Math.round(nameScore * 0.75 + (locationMatch ? 20 : 0) + Math.min(addressScore, 50) * 0.1));
  const reasons = [];
  if (nameScore >= 85) reasons.push('business name closely matches');
  else if (nameScore >= 55) reasons.push('business name is similar');
  if (locationMatch) reasons.push('location matches');
  if (addressScore >= 65) reasons.push('address is similar');
  return { confidence, matchReason: reasons.join(' · ') || 'possible match from search results' };
}

function unwrapGoogleResultUrl(href: string): string {
  try {
    const url = new URL(href, 'https://www.google.com');
    return url.pathname === '/url' ? (url.searchParams.get('q') || href) : url.href;
  } catch {
    return href;
  }
}

function isUsefulGoogleBusinessName(name: string): boolean {
  return Boolean(name && !/^(google maps|google search|sign in|search)$/i.test(name.trim()));
}

function sameCanonicalBusiness(a: DiscoveredBusiness, b: DiscoveredBusiness, input: Record<string, string | undefined>): boolean {
  const aPhone = NAPNormalizer.normalizePhone(a.phone || '');
  const bPhone = NAPNormalizer.normalizePhone(b.phone || '');
  if (aPhone && bPhone && aPhone === bPhone) return true;
  const aWebsite = (a.website || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
  const bWebsite = (b.website || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();
  if (aWebsite && bWebsite && aWebsite === bWebsite) return true;
  const nameScore = NAPNormalizer.calculateSimilarity(NAPNormalizer.normalizeBusinessName(a.businessName), NAPNormalizer.normalizeBusinessName(b.businessName));
  if (nameScore < 82) return false;
  const city = (input.city || '').toLowerCase();
  const cityNames = [city, ...(CITY_ALIASES[city] || []).map((alias) => alias.toLowerCase())].filter(Boolean);
  return !cityNames.length || cityNames.some((name) => a.address.toLowerCase().includes(name) || b.address.toLowerCase().includes(name));
}

function legacyConsolidateCandidates(candidates: DiscoveredBusiness[], input: Record<string, string | undefined>): DiscoveredBusiness[] {
  const consolidated: DiscoveredBusiness[] = [];
  for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence)) {
    const existing = consolidated.find((profile) => sameCanonicalBusiness(profile, candidate, input));
    if (!existing) {
      consolidated.push({ ...candidate, matchedSources: [candidate.directoryName] });
      continue;
    }
    existing.matchedSources = [...new Set([...(existing.matchedSources || [existing.directoryName]), candidate.directoryName])];
    if (candidate.confidence > existing.confidence) {
      existing.confidence = candidate.confidence;
      existing.matchReason = candidate.matchReason;
      existing.searchUrl = candidate.searchUrl;
      existing.directoryName = candidate.directoryName;
      existing.domain = candidate.domain;
    }
    if (candidate.address.length > existing.address.length) existing.address = candidate.address;
    if (!existing.phone && candidate.phone) existing.phone = candidate.phone;
    if (!existing.website && candidate.website) existing.website = candidate.website;
  }
  return consolidated.slice(0, 5);
}

function escapeOverpassRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|"]/g, '\\$&');
}

function openStreetMapUrl(place: OpenStreetMapPlace): string {
  if (place.osm_type && place.osm_id) return `https://www.openstreetmap.org/${place.osm_type}/${place.osm_id}`;
  if (place.lat && place.lon) return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(place.lat)}&mlon=${encodeURIComponent(place.lon)}#map=18/${encodeURIComponent(place.lat)}/${encodeURIComponent(place.lon)}`;
  return 'https://www.openstreetmap.org';
}

async function nominatimSearch(query: string): Promise<OpenStreetMapPlace[]> {
  const cached = nominatimCache.get(query);
  if (cached && cached.expiresAt > Date.now()) return cached.places;
  const wait = Math.max(0, nextNominatimRequestAt - Date.now());
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  nextNominatimRequestAt = Date.now() + 1100; // Public Nominatim policy: max one request per second.
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '10', addressdetails: '1', namedetails: '1', extratags: '1' });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': CONFIG.OSM_USER_AGENT },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const places = await response.json() as OpenStreetMapPlace[];
  nominatimCache.set(query, { places, expiresAt: Date.now() + 15 * 60 * 1000 });
  return places;
}

async function discoverWithOpenStreetMap(input: Record<string, string | undefined>): Promise<DiscoveredBusiness[]> {
  if (!CONFIG.ENABLE_OSM_DISCOVERY) return [];
  const name = cleanQueryText(input.businessName || '');
  const city = cleanQueryText(input.city || '');
  const address = cleanQueryText(input.address || '');
  if (!name && !address) return [];
  const query = cleanQueryText([name, address, city].filter(Boolean).join(' '));
  const places = await nominatimSearch(query);
  const candidates = places
    .filter((place) => place.osm_id && (place.namedetails?.name || place.display_name))
    .slice(0, 10)
    .map((place, index) => {
      const businessName = place.namedetails?.name || place.display_name?.split(',')[0].trim() || name;
      const addressText = place.display_name || Object.values(place.address || {}).join(', ');
      const baseCandidate = { businessName, address: addressText };
      return {
        id: `osm-${place.osm_type || 'place'}-${place.osm_id || index}`,
        ...baseCandidate,
        searchUrl: openStreetMapUrl(place), directoryName: 'OpenStreetMap', domain: 'openstreetmap.org', source: 'openstreetmap' as const,
        phone: place.extratags?.phone || place.extratags?.['contact:phone'] || '', website: place.extratags?.website || place.extratags?.['contact:website'] || '',
        ...legacyScoreCandidate(baseCandidate, input)
      };
    });
  if (candidates.length || !name || !city) return candidates;

  // Nominatim is a text index. Overpass directly checks OSM objects tagged
  // with the exact name inside the requested city, which catches some POIs
  // that have not yet been ranked by Nominatim. Keep this to one small query.
  const cities = [city, ...(CITY_ALIASES[city.toLowerCase()] || [])]
    .map(escapeOverpassRegex).join('|');
  const overpassQuery = `[out:json][timeout:12];area["boundary"="administrative"]["name"~"^(${cities})$",i]->.searchArea;(nwr["name"~"^${escapeOverpassRegex(name)}$",i](area.searchArea););out center 10;`;
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': CONFIG.OSM_USER_AGENT },
    body: new URLSearchParams({ data: overpassQuery }), signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
  const payload = await response.json() as { elements?: OverpassElement[] };
  return (payload.elements || []).slice(0, 10).map((element) => {
    const tags = element.tags || {};
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const addressText = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ');
    const baseCandidate = { businessName: tags.name || name, address: addressText || city };
    return {
      id: `osm-${element.type}-${element.id}`, ...baseCandidate,
      searchUrl: latitude !== undefined && longitude !== undefined
        ? `https://www.openstreetmap.org/${element.type}/${element.id}#map=18/${latitude}/${longitude}`
        : `https://www.openstreetmap.org/${element.type}/${element.id}`,
      directoryName: 'OpenStreetMap (Overpass)', domain: 'openstreetmap.org', source: 'openstreetmap' as const,
      phone: tags.phone || tags['contact:phone'] || '', website: tags.website || tags['contact:website'] || '',
      ...legacyScoreCandidate(baseCandidate, input)
    };
  });
}

async function discoverWithPlacesApi(searchQueries: string[], input: Record<string, string | undefined>): Promise<DiscoveredBusiness[]> {
  if (!CONFIG.GOOGLE_MAPS_API_KEY) return [];
  const candidates: DiscoveredBusiness[] = [];
  const seenPlaceIds = new Set<string>();

  for (const searchQuery of searchQueries) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': CONFIG.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.nationalPhoneNumber,places.websiteUri'
        },
        body: JSON.stringify({ textQuery: searchQuery, languageCode: 'en' }),
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string; googleMapsUri?: string; nationalPhoneNumber?: string; websiteUri?: string }> };
      for (const place of payload.places || []) {
        const businessName = place.displayName?.text?.trim() || '';
        if (!place.id || !businessName || seenPlaceIds.has(place.id)) continue;
        const baseCandidate = { businessName, address: place.formattedAddress || '' };
        candidates.push({
          id: `place-${place.id}`,
          ...baseCandidate,
          searchUrl: place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.id)}`,
          directoryName: 'Google Business Profile', domain: 'google.com/maps', source: 'places_api',
          phone: place.nationalPhoneNumber || '', website: place.websiteUri || '',
          ...legacyScoreCandidate(baseCandidate, input)
        });
        seenPlaceIds.add(place.id);
      }
    } catch (error: any) {
      console.warn(`Places API search failed for "${searchQuery}": ${error.message || error}`);
    }
  }
  return candidates;
}

async function dismissGoogleConsent(page: import('playwright-core').Page): Promise<void> {
  const buttons = page.getByRole('button', { name: /accept all|i agree|accept/i });
  if (await buttons.count()) await buttons.first().click({ timeout: 1500 }).catch(() => {});
}

async function discoverBusinesses(searchQueries: string[], input: Record<string, string | undefined>): Promise<DiscoveryResult> {
  const rawCandidates = await discover({
    name: input.businessName,
    address: input.address,
    city: input.city,
    pin: input.pincode,
    phone: input.phone,
    category: input.category,
    website: input.website,
    ownerName: input.ownerName,
    searchQueries
  });
  const query = await enrichQueryCoordinates({ name: input.businessName, address: input.address, city: input.city, pin: input.pincode, phone: input.phone, category: input.category, website: input.website, ownerName: input.ownerName, searchQueries });
  const candidates = await Promise.all(rawCandidates.map(enrichCandidateCoordinates));
  const clusters = clusterCandidates(candidates, query);
  const diagnostics = rawCandidates.length
    ? [`Discovery returned ${rawCandidates.length} candidate${rawCandidates.length === 1 ? '' : 's'} from configured sources.`]
    : ['No candidate was exposed by the configured discovery sources. Add GOOGLE_MAPS_API_KEY for the supported and most reliable Google Business Profile search.'];
  return { candidates: [], clusters, diagnostics };

  const legacyDiagnostics: string[] = [];
  const apiCandidates = await discoverWithPlacesApi(searchQueries, input);
  if (apiCandidates.length) {
    legacyDiagnostics.push(`Google Places API returned ${apiCandidates.length} match${apiCandidates.length === 1 ? '' : 'es'}.`);
    return { candidates: legacyConsolidateCandidates(apiCandidates, input), diagnostics: legacyDiagnostics };
  }
  if (CONFIG.GOOGLE_MAPS_API_KEY) legacyDiagnostics.push('Google Places API returned no usable matches; trying browser fallbacks.');
  else legacyDiagnostics.push('Google Places API is not configured; using browser fallbacks that Google may limit or redesign.');

  let openStreetMapCandidates: DiscoveredBusiness[] = [];
  try {
    openStreetMapCandidates = await discoverWithOpenStreetMap(input);
    if (openStreetMapCandidates.length) legacyDiagnostics.push(`OpenStreetMap returned ${openStreetMapCandidates.length} possible match${openStreetMapCandidates.length === 1 ? '' : 'es'}.`);
  } catch (error: any) {
    legacyDiagnostics.push(`OpenStreetMap search was unavailable: ${error.message || error}`);
  }

  let browser;
  try {
    ({ browser } = await BrowserFactory.getBrowser());
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const candidates: DiscoveredBusiness[] = [...openStreetMapCandidates];
    const seenUrls = new Set<string>(candidates.map((candidate) => candidate.searchUrl));
    const page = await context.newPage();

    for (const searchQuery of searchQueries) {
      try {
        await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
          waitUntil: 'domcontentloaded', timeout: 15000
        });
        await dismissGoogleConsent(page);
        await page.waitForSelector('h1.fontHeadlineLarge, h1.DUwif, a.hfpxzc, a[href*="/maps/place/"]', { timeout: 5000 }).catch(() => {});
      } catch (error: any) {
        legacyDiagnostics.push(`Google Maps could not load “${searchQuery}”: ${error.message || error}`);
      }

      // A precise Maps search often opens a single place page (as in the
      // reported case), not a result list. The old implementation only read
      // list links, so it returned zero for this successful result.
      const directName = (await page.locator('h1.fontHeadlineLarge, h1.DUwif').first().innerText().catch(() => '')).trim();
      const directAddress = (await page.locator('button[data-item-id="address"], [data-item-id="address"] .Io6fl3').first().innerText().catch(() => '')).trim();
      const directPhone = (await page.locator('button[data-item-id^="phone"]').first().innerText().catch(() => '')).trim();
      const directWebsite = await page.locator('a[data-item-id="authority"]').first().getAttribute('href').catch(() => '');
      if (isUsefulGoogleBusinessName(directName)) {
        const baseCandidate = { businessName: directName, address: directAddress };
        const searchUrl = page.url();
        candidates.push({
          id: `maps-direct-${candidates.length + 1}`, ...baseCandidate, searchUrl,
          directoryName: 'Google Maps', domain: 'google.com/maps', source: 'maps_page',
          phone: directPhone, website: directWebsite || '',
          ...legacyScoreCandidate(baseCandidate, input)
        });
        seenUrls.add(searchUrl);
      }

      const links = page.locator('a.hfpxzc, a[href*="/maps/place/"]');
      const count = Math.min(await links.count(), 10);
      for (let index = 0; index < count; index += 1) {
        const link = links.nth(index);
        const searchUrl = await link.getAttribute('href');
        const label = (await link.getAttribute('aria-label')) || (await link.innerText().catch(() => ''));
        const absoluteUrl = unwrapGoogleResultUrl(searchUrl || '');
        if (!absoluteUrl || !label || seenUrls.has(absoluteUrl)) continue;
        const cardText = await link.locator('xpath=ancestor::div[@role="article"][1]').innerText().catch(async () => link.locator('xpath=../..').innerText().catch(() => ''));
        const lines = cardText.split('\n').map((line: string) => line.trim()).filter(Boolean);
        const baseCandidate = { businessName: label.trim(), address: lines.slice(1, 4).join(', ') };
        candidates.push({
          id: `google-${candidates.length + 1}`,
          ...baseCandidate,
          searchUrl: absoluteUrl, directoryName: 'Google Maps', domain: 'google.com/maps', source: 'maps_page',
          ...legacyScoreCandidate(baseCandidate, input)
        });
        seenUrls.add(absoluteUrl);
      }

      // Maps can return consent/challenge pages or change its card markup. A normal
      // Google search is a useful fallback because it also finds a business's site
      // and directory profiles (e.g. Justdial) that the customer can confirm.
      try {
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, {
          waitUntil: 'domcontentloaded', timeout: 15000
        });
        await dismissGoogleConsent(page);
        await page.waitForSelector('a:has(h3)', { timeout: 4000 }).catch(() => {});
      } catch (error: any) {
        legacyDiagnostics.push(`Google Search could not load “${searchQuery}”: ${error.message || error}`);
        continue;
      }
      const resultLinks = page.locator('a:has(h3)');
      const resultCount = Math.min(await resultLinks.count(), 10);
      for (let index = 0; index < resultCount; index += 1) {
        const link = resultLinks.nth(index);
        const rawHref = await link.getAttribute('href');
        const title = (await link.locator('h3').innerText().catch(() => '')).trim();
        const searchUrl = rawHref ? unwrapGoogleResultUrl(rawHref) : '';
        if (!searchUrl || !title || seenUrls.has(searchUrl) || !/^https?:\/\//.test(searchUrl)) continue;
        const resultText = await link.locator('xpath=../../..').innerText().catch(() => '');
        const address = resultText.replace(title, '').split('\n').map((line: string) => line.trim()).filter(Boolean).slice(0, 3).join(', ');
        const domain = new URL(searchUrl).hostname.replace(/^www\./, '');
        const baseCandidate = { businessName: title, address };
        candidates.push({
          id: `web-${candidates.length + 1}`,
          ...baseCandidate,
          searchUrl, directoryName: 'Google Search', domain, source: 'google_search',
          ...legacyScoreCandidate(baseCandidate, input)
        });
        seenUrls.add(searchUrl);
      }
    }
    if (!candidates.length) legacyDiagnostics.push('No candidate was exposed by the configured discovery sources. Add GOOGLE_MAPS_API_KEY for the supported and most reliable Google Business Profile search.');
    return { candidates: legacyConsolidateCandidates(candidates, input), diagnostics: legacyDiagnostics };
  } catch (error: any) {
    // Discovery is optional pre-audit assistance. Do not turn a missing browser
    // binary or a transient Google failure into a misleading 500 response.
    legacyDiagnostics.push(`Browser discovery is unavailable: ${error.message || error}`);
    legacyDiagnostics.push('Configure GOOGLE_MAPS_API_KEY to use the supported Google Places API path without a browser.');
    return { candidates: legacyConsolidateCandidates(openStreetMapCandidates, input), diagnostics: legacyDiagnostics };
  } finally {
    await browser?.close().catch(() => {});
  }
}

// Search the web for businesses before asking the user which one to audit.
app.post(['/api/search', '/search'], async (req: Request, res: Response) => {
  try {
    const { businessName, address, city, pincode, phone, category, website, ownerName } = req.body;

    // Build search query from whatever the user provided
    const searchParts = [businessName, category, address, city].filter(Boolean);
    if (searchParts.length === 0 && !phone && !website) {
      return res.status(400).json({ error: 'Please provide at least one detail to search (business name, address, phone, etc.).' });
    }

    const searchQuery = searchParts.join(' ') || phone || website;
    const searchQueries = buildSearchQueries({ businessName, address, city, category, phone, website });
    console.log(`\n🔍 Discovering businesses online with: ${searchQueries.join(' | ')}`);
    const discovery = await discoverBusinesses(searchQueries, { businessName, address, city, pincode, category, phone, website, ownerName });

    return res.json({
      success: true,
      query: searchQuery,
      searchedQueries: searchQueries,
      totalFound: discovery.clusters?.length || 0,
      clusters: discovery.clusters || [],
      ...(discovery.clusters?.length ? {} : { message: 'no confident match, try adding phone or website' }),
      diagnostics: discovery.diagnostics,
      directoryPlan: getDirectoryCatalog(category || businessName || '')
    });
  } catch (error: any) {
    console.error('Search error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// API Endpoint to execute NAP audit
app.post(['/api/audit', '/audit'], async (req: Request, res: Response) => {
  try {
    const { businessName, address, city, pincode, phone, category, website, directoryIds, selectedClusters } = req.body;
    const selectedClusterRecords = Array.isArray(selectedClusters)
      ? selectedClusters.filter((cluster): cluster is BusinessCluster => Boolean(cluster && typeof cluster.id === 'string' && cluster.representative))
      : [];
    const primaryCluster = selectedClusterRecords.find((cluster) => cluster.status === 'PRIMARY_MATCH') || selectedClusterRecords[0];
    const primary = primaryCluster?.representative;
    const selectedRepresentatives = [primary, ...selectedClusterRecords.filter((cluster) => cluster !== primaryCluster).map((cluster) => cluster.representative)].filter(Boolean);
    const mergedValue = (field: 'name' | 'address' | 'phone' | 'category' | 'website', fallback: string) =>
      selectedRepresentatives.map((representative) => representative?.[field]).find((value): value is string => typeof value === 'string' && Boolean(value.trim())) || fallback;

    if (!businessName && !address && !phone && !website && !primary) {
      return res.status(400).json({ error: 'Please provide at least one business detail to run the audit.' });
    }

    const sourceNAP: SourceOfTruthNAP = {
      businessName: mergedValue('name', businessName || 'Unknown Business'),
      address: mergedValue('address', address || ''),
      city: city || '',
      pincode: pincode || '',
      phone: mergedValue('phone', phone || ''),
      category: mergedValue('category', category || 'Business'),
      website: mergedValue('website', website || '')
    };

    console.log(`\n🚀 Web API Request: Starting audit for "${businessName}"...`);
    const validDirectoryIds = new Set(getAllDirectoryProviders().map((provider) => provider.directoryId));
    const directoryPlan = getDirectoryCatalog(category || businessName || '');
    const categoryDirectoryIds = directoryPlan
      .filter((directory) => directory.auditStatus === 'supported' && validDirectoryIds.has(directory.id))
      .map((directory) => directory.id);
    const selectedDirectoryIds = Array.isArray(directoryIds)
      ? directoryIds.filter((id): id is string => typeof id === 'string' && validDirectoryIds.has(id))
      : categoryDirectoryIds;
    if (Array.isArray(directoryIds) && (!selectedDirectoryIds || selectedDirectoryIds.length === 0)) {
      return res.status(400).json({ error: 'Choose at least one supported directory to audit.' });
    }

    const agent = new CitationAuditAgent();
    const report = await agent.runAudit(sourceNAP, { directoryIds: selectedDirectoryIds });
    const duplicateClusters = selectedClusterRecords.filter((cluster) => cluster.status === 'POSSIBLE_DUPLICATE_OR_OLD_LISTING');
    const hasDistinctDuplicate = duplicateClusters.some((cluster) => {
      const duplicate = cluster.representative;
      return (duplicate.phone && NAPNormalizer.normalizePhone(duplicate.phone) !== NAPNormalizer.normalizePhone(sourceNAP.phone || '')) ||
        (duplicate.address && NAPNormalizer.normalizeAddress(duplicate.address) !== NAPNormalizer.normalizeAddress(sourceNAP.address || ''));
    });
    if (hasDistinctDuplicate) {
      report.results.forEach((result) => {
        if (result.status === 'INCONSISTENT' || result.status === 'DRIFT') result.status = 'DUPLICATE_FOUND';
      });
    }
    report.selectedClusters = selectedClusterRecords.map((cluster) => ({
      id: cluster.id,
      status: cluster.status,
      businessName: cluster.representative.name
    }));
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: client, error: clientError } = await supabase.from('clients').upsert({ name: sourceNAP.businessName, phone: sourceNAP.phone || null }, { onConflict: 'name,phone' }).select('id').single();
      if (clientError) throw clientError;
      const { data: saved, error: reportError } = await supabase.from('dashboard_audit_reports').insert({ client_id: client.id, report_json: report }).select('id').single();
      if (reportError) throw reportError;
      (report as any).auditReportRef = saved.id;
    }
    const markdownReport = NAPReporter.generateMarkdownReport(report);

    return res.json({
      success: true,
      report,
      markdownReport,
      directoryPlan
    });
  } catch (error: any) {
    console.error('Audit execution error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

app.post('/api/audit/approve', async (req: Request, res: Response) => {
  try {
    const { auditReportRef, directory, findings, consent } = req.body;
    if (!auditReportRef || !directory || !Array.isArray(findings) || !consent) return res.status(400).json({ error: 'Consent, audit report reference, directory, and findings are required.' });
    const supabase = getSupabaseClient(); if (!supabase) return res.status(503).json({ error: 'Supabase is not configured.' });
    const operator = CONFIG.INTERNAL_OPERATOR_NAME;
    const { error: consentError } = await supabase.from('write_consents').insert({ audit_report_ref: auditReportRef, directory, fields_to_change: findings, consented_by: operator });
    if (consentError) throw consentError;
    const approved = findings.map((finding: any) => ({ audit_report_ref: auditReportRef, directory, field: finding.field, current_value: finding.currentValue, proposed_value: finding.proposedValue, approved_by: operator }));
    const { error: approvalError } = await supabase.from('approved_corrections').insert(approved); if (approvalError) throw approvalError;
    const isGbp = directory === 'google_business' || directory === 'gbp';
    if (isGbp) { const { error } = await supabase.from('write_jobs').insert(approved.map((finding: any) => ({ ...finding, status: 'PENDING' }))); if (error) throw error; }
    return res.json({ success: true, automated: isGbp, message: isGbp ? 'Approved GBP corrections queued.' : 'Approved — manual action needed for this directory.' });
  } catch (error: any) { return res.status(500).json({ error: error.message || 'Could not approve corrections.' }); }
});

app.get('/api/gbp/oauth/connect', (req: Request, res: Response) => {
  const { clientId, locationName } = req.query;
  if (!CONFIG.GOOGLE_OAUTH_CLIENT_ID || !CONFIG.GOOGLE_OAUTH_REDIRECT_URI || !clientId || !locationName) return res.status(400).send('Missing GBP OAuth configuration or client/location identity.');
  const state = Buffer.from(JSON.stringify({ clientId, locationName })).toString('base64url');
  const params = new URLSearchParams({ client_id: CONFIG.GOOGLE_OAUTH_CLIENT_ID, redirect_uri: CONFIG.GOOGLE_OAUTH_REDIRECT_URI, response_type: 'code', access_type: 'offline', prompt: 'consent', scope: 'https://www.googleapis.com/auth/business.manage', state });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/gbp/oauth/callback', async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query; if (typeof code !== 'string' || typeof state !== 'string') throw new Error('Missing OAuth code or state.');
    const identity = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { clientId: string; locationName: string };
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: CONFIG.GOOGLE_OAUTH_CLIENT_ID, client_secret: CONFIG.GOOGLE_OAUTH_CLIENT_SECRET, redirect_uri: CONFIG.GOOGLE_OAUTH_REDIRECT_URI, grant_type: 'authorization_code' }) });
    if (!tokenResponse.ok) throw new Error(`Google OAuth token exchange failed: ${tokenResponse.status}`);
    const rawTokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    const tokens = { ...rawTokens, expires_at: Date.now() + Math.max(0, (rawTokens.expires_in || 3600) - 60) * 1000 };
    const supabase = getSupabaseClient(); if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.from('gbp_connections').upsert({ client_id: identity.clientId, location_name: identity.locationName, encrypted_tokens: encrypt(tokens) }, { onConflict: 'client_id,location_name' }); if (error) throw error;
    res.send('Google Business Profile connected. You may close this window.');
  } catch (error: any) { res.status(500).send(`Google Business Profile connection failed: ${error.message || error}`); }
});

app.get('/api/audit/stream', async (req: Request, res: Response) => {
  const payload = typeof req.query.payload === 'string' ? req.query.payload : '';
  try {
    const body = JSON.parse(payload);
    const selectedClusterRecords = Array.isArray(body.selectedClusters) ? body.selectedClusters.filter((cluster: any) => cluster?.representative) : [];
    const primaryCluster = selectedClusterRecords.find((cluster: any) => cluster.status === 'PRIMARY_MATCH') || selectedClusterRecords[0];
    const primary = primaryCluster?.representative;
    const sourceNAP: SourceOfTruthNAP = {
      businessName: primary?.name || body.businessName || 'Unknown Business', address: primary?.address || body.address || '', city: body.city || '', pincode: body.pincode || '',
      phone: primary?.phone || body.phone || '', category: primary?.category || body.category || 'Business', website: primary?.website || body.website || ''
    };
    const validDirectoryIds = new Set(getAllDirectoryProviders().map((provider) => provider.directoryId));
    const directoryIds = Array.isArray(body.directoryIds) ? body.directoryIds.filter((id: unknown): id is string => typeof id === 'string' && validDirectoryIds.has(id)) : getDirectoryCatalog(sourceNAP.category || sourceNAP.businessName || '').filter((directory) => directory.auditStatus === 'supported' && validDirectoryIds.has(directory.id)).map((directory) => directory.id);
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.flushHeaders();
    const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    const agent = new CitationAuditAgent();
    const report = await agent.runAudit(sourceNAP, { directoryIds, onEvent: send });
    report.selectedClusters = selectedClusterRecords.map((cluster: any) => ({ id: cluster.id, status: cluster.status, businessName: cluster.representative.name }));
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: client, error: clientError } = await supabase.from('clients').upsert({ name: sourceNAP.businessName, phone: sourceNAP.phone || null }, { onConflict: 'name,phone' }).select('id').single();
      if (clientError) throw clientError;
      const { data: saved, error: reportError } = await supabase.from('dashboard_audit_reports').insert({ client_id: client.id, report_json: report }).select('id').single();
      if (reportError) throw reportError;
      (report as any).auditReportRef = saved.id;
    }
    send({ type: 'complete', report, markdownReport: NAPReporter.generateMarkdownReport(report) });
    res.end();
  } catch (error: any) {
    if (!res.headersSent) res.status(400).set({ 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message || 'Audit stream failed.' })}\n\n`);
    res.end();
  }
});

// Health check endpoint
app.get(['/api/health', '/health'], (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the Single Page Suite & Audit Dashboard
const getDashboardHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus Suite | Agency Operations & Audit Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 50% -10%, #1e1b4b 0%, #0f172a 60%, #090d16 100%);
      --card-bg: rgba(30, 41, 59, 0.65);
      --card-border: rgba(255, 255, 255, 0.1);
      --card-border-hover: rgba(99, 102, 241, 0.4);
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --accent: #10b981;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --consistent: #10b981;
      --drift: #f59e0b;
      --inconsistent: #ef4444;
      --notfound: #6b7280;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg-gradient);
      color: var(--text-main);
      min-height: 100vh;
      padding-bottom: 3rem;
    }

    /* Top Navbar */
    .navbar {
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .nav-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-family: 'Outfit', sans-serif;
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-main);
      text-decoration: none;
      cursor: pointer;
    }

    .nav-brand span {
      background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .nav-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--accent);
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 0.35rem 0.85rem;
      border-radius: 9999px;
      font-weight: 600;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background-color: var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--accent);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }

    .btn-back-nav {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 0.45rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      display: none;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
    }

    .btn-back-nav:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.25);
    }

    .container {
      max-width: 1200px;
      margin: 2rem auto 0;
      padding: 0 1.5rem;
    }

    /* Main Dashboard Header */
    .hero-header {
      text-align: center;
      margin-bottom: 3rem;
    }

    .hero-header h1 {
      font-family: 'Outfit', sans-serif;
      font-size: 2.8rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 40%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.75rem;
    }

    .hero-header p {
      color: var(--text-muted);
      font-size: 1.1rem;
      max-width: 650px;
      margin: 0 auto 1.5rem;
      line-height: 1.6;
    }

    .hero-stats {
      display: inline-flex;
      gap: 1.5rem;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--card-border);
      padding: 0.6rem 1.5rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .hero-stats span strong {
      color: #fff;
    }

    /* Suite Modules Grid */
    .suite-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 1.75rem;
    }

    .module-card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .module-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: transparent;
      transition: background 0.3s ease;
    }

    .module-card.active-module::before {
      background: linear-gradient(90deg, #6366f1, #10b981);
    }

    .module-card:hover {
      transform: translateY(-5px);
      border-color: var(--card-border-hover);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), 0 0 25px rgba(99, 102, 241, 0.15);
    }

    .card-top {
      margin-bottom: 1.5rem;
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.25rem;
    }

    .icon-box {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      color: #a5b4fc;
    }

    .icon-box.disabled {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
      color: #64748b;
    }

    .status-badge-pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.3rem 0.75rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-badge-pill.status-active {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .status-badge-pill.status-coming {
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }

    .module-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.4rem;
      font-weight: 700;
      margin-bottom: 0.6rem;
      color: #fff;
    }

    .module-desc {
      color: var(--text-muted);
      font-size: 0.95rem;
      line-height: 1.55;
    }

    .module-footer {
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .btn-launch {
      width: 100%;
      background: linear-gradient(135deg, var(--primary) 0%, #4338ca 100%);
      color: #fff;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 1rem;
      padding: 0.85rem 1.25rem;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 8px 20px rgba(99, 102, 241, 0.3);
    }

    .btn-launch:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
      transform: scale(1.02);
      box-shadow: 0 12px 25px rgba(99, 102, 241, 0.45);
    }

    .btn-coming-soon {
      width: 100%;
      background: rgba(255, 255, 255, 0.04);
      color: #64748b;
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 0.95rem;
      padding: 0.85rem 1.25rem;
      border: 1px dashed rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      cursor: not-allowed;
      text-align: center;
    }

    /* Views visibility */
    #mainDashboardView { display: block; }
    #napAuditView { display: none; }

    /* Audit Form & Card Styles */
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2rem;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      margin-bottom: 2rem;
    }

    .card-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #fff;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-group label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .form-group input {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 0.75rem 1rem;
      color: #fff;
      font-family: inherit;
      font-size: 0.95rem;
      transition: all 0.2s ease;
    }

    .form-group input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
    }

    .btn-submit {
      width: 100%;
      background: linear-gradient(135deg, var(--primary) 0%, #4338ca 100%);
      color: #fff;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 1.1rem;
      padding: 1rem;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      margin-top: 1.5rem;
      transition: all 0.2s ease;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);
    }

    .btn-submit:hover {
      background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%);
    }

    /* Loading State */
    .loading-state {
      display: none;
      text-align: center;
      padding: 4rem 2rem;
    }

    .spinner {
      width: 50px;
      height: 50px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1.5rem;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Results Dashboard */
    .results-container {
      display: none;
    }

    .score-banner {
      display: flex;
      align-items: center;
      gap: 2.5rem;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.5rem 2rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .score-circle {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: conic-gradient(var(--accent) calc(var(--score) * 1%), rgba(255, 255, 255, 0.1) 0);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .score-circle-inner {
      width: 82px;
      height: 82px;
      background: #0f172a;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .score-num {
      font-family: 'Outfit', sans-serif;
      font-size: 1.5rem;
      font-weight: 800;
      color: #fff;
    }

    .score-label {
      font-size: 0.65rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
      flex: 1;
    }

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .hero-header h1 { font-size: 2.1rem; }
    }

    .stat-box {
      background: rgba(30, 41, 59, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
    }

    .stat-val {
      font-family: 'Outfit', sans-serif;
      font-size: 1.75rem;
      font-weight: 800;
      color: #fff;
    }

    .stat-title {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.2rem;
    }

    .dir-card {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .dir-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .dir-name {
      font-family: 'Outfit', sans-serif;
      font-size: 1.15rem;
      font-weight: 700;
    }

    .status-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      text-transform: uppercase;
    }

    .badge-CONSISTENT { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-DRIFT { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .badge-INCONSISTENT { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-NOT_FOUND { background: rgba(107, 114, 128, 0.15); color: #9ca3af; }

    .diff-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
      margin-top: 0.5rem;
    }

    .diff-table th, .diff-table td {
      padding: 0.6rem 0.8rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .diff-table th {
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .match-icon { font-weight: 700; }
    .match-EXACT { color: #34d399; }
    .match-DRIFT { color: #fbbf24; }
    .match-MISMATCH { color: #f87171; }
    .match-MISSING { color: #9ca3af; }

    .action-row {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
      flex-wrap: wrap;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 0.75rem 1.25rem;
      border-radius: 10px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
      font-size: 0.9rem;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    /* Step Indicator */
    .step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }

    .step-dot {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 0.85rem;
      border: 2px solid rgba(255, 255, 255, 0.15);
      color: #64748b;
      background: rgba(15, 23, 42, 0.5);
      transition: all 0.3s ease;
    }

    .step-dot.active {
      background: linear-gradient(135deg, var(--primary) 0%, #4338ca 100%);
      border-color: var(--primary);
      color: #fff;
      box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
    }

    .step-dot.completed {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .step-line {
      width: 60px;
      height: 2px;
      background: rgba(255, 255, 255, 0.1);
      transition: background 0.3s ease;
    }

    .step-line.active {
      background: linear-gradient(90deg, var(--accent), var(--primary));
    }

    .step-label {
      font-size: 0.7rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 600;
      margin-top: 0.25rem;
    }

    .step-label.active {
      color: var(--text-main);
    }

    .step-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
    }

    /* Form helper text */
    .form-hint {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }

    .form-hint strong {
      color: var(--accent);
    }

    /* Search Results */
    #searchResultsView { display: none; }

    .search-query-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 1rem 1.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .search-query-banner .query-text {
      color: var(--text-muted);
      font-size: 0.9rem;
    }

    .search-query-banner .query-text strong {
      color: #fff;
    }

    .search-variants {
      color: #94a3b8;
      font-size: 0.78rem;
      line-height: 1.5;
      margin: -0.75rem 0 1.25rem;
    }

    .match-confidence {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      margin-top: 0.25rem;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.13);
      font-size: 0.74rem;
      font-weight: 700;
    }

    .btn-modify-search {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 0.4rem 1rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-modify-search:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }

    .profiles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .profile-card {
      background: rgba(15, 23, 42, 0.5);
      border: 2px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
    }

    .profile-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: transparent;
      transition: background 0.3s ease;
    }

    .profile-card:hover {
      border-color: rgba(99, 102, 241, 0.4);
      transform: translateY(-3px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
    }

    .profile-card.selected {
      border-color: var(--accent);
      background: rgba(16, 185, 129, 0.08);
      box-shadow: 0 0 25px rgba(16, 185, 129, 0.15);
    }

    .profile-card.selected::before {
      background: linear-gradient(90deg, var(--accent), #059669);
    }

    .profile-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .profile-card-dir {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .profile-card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.3rem;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .profile-card-dir-name {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 1rem;
      color: #fff;
    }

    .profile-card-domain {
      font-size: 0.75rem;
      color: #64748b;
    }

    .profile-select-check {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .profile-card.selected .profile-select-check {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .profile-card-body {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .profile-detail {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .profile-detail .detail-icon {
      flex-shrink: 0;
      width: 16px;
      text-align: center;
    }

    .profile-card-link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      margin-top: 0.75rem;
      font-size: 0.8rem;
      color: #818cf8;
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s ease;
    }

    .profile-card-link:hover {
      color: #a5b4fc;
    }

    .select-all-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .select-all-row .selected-count {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .select-all-row .selected-count strong {
      color: var(--accent);
    }

    .btn-select-all {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 0.4rem 0.85rem;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-select-all:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }

    .btn-run-audit {
      width: 100%;
      background: linear-gradient(135deg, var(--accent) 0%, #059669 100%);
      color: #fff;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 1.1rem;
      padding: 1rem;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
    }

    .btn-run-audit:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: scale(1.02);
    }

    .btn-run-audit:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      transform: none;
    }

    /* Loading step text */
    .loading-steps {
      margin-top: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      text-align: left;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    .loading-step {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.85rem;
      color: #64748b;
      transition: color 0.3s ease;
    }

    .loading-step.active {
      color: var(--accent);
    }

    .loading-step.done {
      color: #34d399;
    }

    .loading-step-icon {
      width: 20px;
      text-align: center;
    }
  </style>
</head>
<body>

  <!-- Top Navigation Bar -->
  <nav class="navbar">
    <div class="nav-brand" onclick="showMainDashboard()">
      <span>⚡ Nexus Suite</span> Command Center
    </div>
    <div style="display: flex; align-items: center; gap: 1rem;">
      <button class="btn-back-nav" id="btnBackToDashboard" onclick="showMainDashboard()">
        ← Back to Main Dashboard
      </button>
      <div class="nav-status">
        <div class="status-dot"></div>
        System Online
      </div>
    </div>
  </nav>

  <div class="container">

    <!-- VIEW 1: Main Suite Dashboard -->
    <div id="mainDashboardView">
      <div class="hero-header">
        <h1>Agency Operations & Audit Suite</h1>
        <p>100% Self-Hosted Automated Directory Scrapers, Technical Audits, Quotes, Invoicing & Business Intelligence Suite.</p>
        <div class="hero-stats">
          <span>Active Tools: <strong>1 Online</strong></span>
          <span>Scraper Engine: <strong>Chromium Playwright</strong></span>
          <span>SaaS Costs: <strong>$0 / month</strong></span>
        </div>
      </div>

      <div class="suite-grid">

        <!-- Module 1: Local Citation & NAP Audit (ACTIVE) -->
        <div class="module-card active-module">
          <div class="card-top">
            <div class="card-header-row">
              <div class="icon-box">📍</div>
              <span class="status-badge-pill status-active">● Active Tool</span>
            </div>
            <h3 class="module-title">Local Citation & NAP Audit</h3>
            <p class="module-desc">Scrape major Indian business directories (Justdial, Practo, Sulekha, Google) to detect NAP (Name, Address, Phone) drifts & inconsistent citations.</p>
          </div>
          <div class="module-footer">
            <a class="btn-launch" href="/audit">
              <span>🚀 Launch Local Citation & NAP Audit</span>
            </a>
          </div>
        </div>

        <!-- Module 2: Express Audit (Coming Soon) -->
        <div class="module-card">
          <div class="card-top">
            <div class="card-header-row">
              <div class="icon-box disabled">⚡</div>
              <span class="status-badge-pill status-coming">⏳ Coming Soon</span>
            </div>
            <h3 class="module-title">Express Audit</h3>
            <p class="module-desc">Lightning-fast 60-second snapshot analysis of website Core Web Vitals, Google Business Profile index status, and basic SEO meta tags.</p>
          </div>
          <div class="module-footer">
            <button class="btn-coming-soon" disabled>Coming Soon</button>
          </div>
        </div>

        <!-- Module 3: Deep Audit (Coming Soon) -->
        <div class="module-card">
          <div class="card-top">
            <div class="card-header-row">
              <div class="icon-box disabled">🔬</div>
              <span class="status-badge-pill status-coming">⏳ Coming Soon</span>
            </div>
            <h3 class="module-title">Deep Technical Audit</h3>
            <p class="module-desc">Multi-page website crawler to audit page speed, broken links, Schema structured data, duplicate content, and backlink authority.</p>
          </div>
          <div class="module-footer">
            <button class="btn-coming-soon" disabled>Coming Soon</button>
          </div>
        </div>

        <!-- Module 4: Quotes & Proposals (Coming Soon) -->
        <div class="module-card">
          <div class="card-top">
            <div class="card-header-row">
              <div class="icon-box disabled">📝</div>
              <span class="status-badge-pill status-coming">⏳ Coming Soon</span>
            </div>
            <h3 class="module-title">Quotes & Proposals</h3>
            <p class="module-desc">Generate client-ready SEO proposals, customizable service quotes, scopes of work, and downloadable client agreement PDFs.</p>
          </div>
          <div class="module-footer">
            <button class="btn-coming-soon" disabled>Coming Soon</button>
          </div>
        </div>

        <!-- Module 5: Invoices & Billing (Coming Soon) -->
        <div class="module-card">
          <div class="card-top">
            <div class="card-header-row">
              <div class="icon-box disabled">💳</div>
              <span class="status-badge-pill status-coming">⏳ Coming Soon</span>
            </div>
            <h3 class="module-title">Invoices & Retainers</h3>
            <p class="module-desc">Manage recurring client retainers, track invoice payment statuses, automated reminder triggers, and tax summary statements.</p>
          </div>
          <div class="module-footer">
            <button class="btn-coming-soon" disabled>Coming Soon</button>
          </div>
        </div>

        <!-- Module 6: Executive Client Reports (Coming Soon) -->
        <div class="module-card">
          <div class="card-top">
            <div class="card-header-row">
              <div class="icon-box disabled">📊</div>
              <span class="status-badge-pill status-coming">⏳ Coming Soon</span>
            </div>
            <h3 class="module-title">Executive Reports</h3>
            <p class="module-desc">Consolidate client audit metrics, historical NAP score improvements, and white-labeled PDF performance benchmarks.</p>
          </div>
          <div class="module-footer">
            <button class="btn-coming-soon" disabled>Coming Soon</button>
          </div>
        </div>

      </div>
    </div>


    <!-- VIEW 2: Local Citation & NAP Audit Tool -->
    <div id="napAuditView">

      <!-- Step Indicator -->
      <div class="step-indicator" id="stepIndicator">
        <div class="step-group">
          <div class="step-dot active" id="step1Dot">1</div>
          <div class="step-label active" id="step1Label">Search</div>
        </div>
        <div class="step-line" id="stepLine1"></div>
        <div class="step-group">
          <div class="step-dot" id="step2Dot">2</div>
          <div class="step-label" id="step2Label">Choose</div>
        </div>
        <div class="step-line" id="stepLine2"></div>
        <div class="step-group">
          <div class="step-dot" id="step3Dot">3</div>
          <div class="step-label" id="step3Label">Scan</div>
        </div>
      </div>

      <!-- Step 1: Search Form Card -->
      <div class="card" id="formCard">
        <div class="card-title">🔍 Find a Business to Audit</div>
        <p class="form-hint">Enter <strong>any</strong> detail you know about the business — name, phone, address, or website. All fields are optional. We'll try close spelling and city variations, then ask you to confirm the right business.</p>
        <form id="searchForm">
          <div class="grid-2">
            <div class="form-group">
              <label>Business Name</label>
              <input type="text" id="businessName" placeholder="e.g. Nissa Dental Clinic">
            </div>
            <div class="form-group">
              <label>Category / Type</label>
              <input type="text" id="category" placeholder="e.g. Dental Clinic, Restaurant">
            </div>
            <div class="form-group">
              <label>Street Address</label>
              <input type="text" id="address" placeholder="e.g. 100 Feet Road, Koramangala">
            </div>
            <div class="form-group">
              <label>City</label>
              <input type="text" id="city" placeholder="e.g. Bengaluru">
            </div>
            <div class="form-group">
              <label>Pincode</label>
              <input type="text" id="pincode" placeholder="e.g. 560034">
            </div>
            <div class="form-group">
              <label>Phone Number</label>
              <input type="text" id="phone" placeholder="e.g. 08098765432">
            </div>
            <div class="form-group">
              <label>Owner / Doctor Name (optional)</label>
              <input type="text" id="ownerName" placeholder="e.g. Dr. Priya Sharma">
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>Website URL</label>
              <input type="url" id="website" placeholder="e.g. https://example.com">
            </div>
          </div>
          <button type="submit" class="btn-submit" id="searchBtn">
            <span>🔍 Search Business Profiles</span>
          </button>
        </form>
      </div>

      <!-- Step 2: Search Results / Profile Selection -->
      <div id="searchResultsView">
        <div class="card">
          <div class="card-title">🌐 Businesses Found Online</div>
          <div class="search-query-banner" id="searchQueryBanner">
            <span class="query-text">Searched for: <strong id="searchQueryText"></strong></span>
            <button class="btn-modify-search" onclick="backToSearch()">✏️ Modify Search</button>
          </div>
          <p class="search-variants" id="searchedQueriesText"></p>
          <div class="select-all-row">
            <span class="selected-count"><strong id="selectedCountText">0</strong> of <span id="totalProfilesText">0</span> clusters selected — select every current or old listing to review before auditing.</span>
          </div>
          <div class="profiles-grid" id="profilesGrid"></div>
          <p class="search-variants" id="directoryPlanText"></p>
          <button class="btn-run-audit" id="btnRunAudit" onclick="runAuditOnSelected()" disabled>
            ✓ Confirm Business & Scan Listings
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div class="card loading-state" id="loadingState">
        <div class="spinner"></div>
        <h3 style="font-family: 'Outfit'; font-size: 1.4rem; margin-bottom: 0.5rem; color: #fff;" id="loadingTitle">Searching Business Profiles...</h3>
        <p style="color: var(--text-muted); font-size: 0.95rem;" id="loadingSubtext">Scanning directories across the internet to find your business.</p>
        <div class="loading-steps" id="loadingSteps"></div>
        <div id="liveFeed" style="display:none; max-height:360px; overflow-y:auto; margin-top:1rem; text-align:left;"></div>
      </div>

      <!-- Results Dashboard -->
      <div class="results-container" id="resultsContainer">
        <div class="card">
          <div class="score-banner">
            <div class="score-circle" id="scoreCircle" style="--score: 85;">
              <div class="score-circle-inner">
                <span class="score-num" id="scoreValue">85%</span>
                <span class="score-label">NAP Score</span>
              </div>
            </div>
            <div class="stats-grid">
              <div class="stat-box">
                <div class="stat-val" id="statChecked">0</div>
                <div class="stat-title">Directories Checked</div>
              </div>
              <div class="stat-box">
                <div class="stat-val" style="color: var(--consistent);" id="statConsistent">0</div>
                <div class="stat-title">Consistent</div>
              </div>
              <div class="stat-box">
                <div class="stat-val" style="color: var(--drift);" id="statInconsistent">0</div>
                <div class="stat-title">Drift / Inconsistent</div>
              </div>
              <div class="stat-box">
                <div class="stat-val" style="color: var(--notfound);" id="statMissing">0</div>
                <div class="stat-title">Not Found</div>
              </div>
            </div>
          </div>

          <div class="card-title">📊 Directory Audit Breakdown</div>
          <div id="directoryCardsList"></div>

          <div class="action-row">
            <button class="btn-secondary" onclick="copyMarkdownReport()">📋 Copy Markdown Report</button>
            <button class="btn-secondary" onclick="downloadJSONReport()">💾 Export JSON</button>
            <button class="btn-secondary" onclick="copyClientReportLink()" id="copyReportLinkBtn">🔗 Copy Client Report Link</button>
            <button class="btn-secondary" onclick="resetForm()" style="margin-left: auto;">🔄 Audit Another Business</button>
          </div>
        </div>
      </div>

    </div>

  </div>

<script>
let lastReportData = null;
let lastMarkdownReport = '';
let discoveredClusters = [];
let selectedClusterIds = new Set();
let currentSearchData = {};

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function openNapAudit() {
  document.getElementById('mainDashboardView').style.display = 'none';
  document.getElementById('napAuditView').style.display = 'block';
  document.getElementById('btnBackToDashboard').style.display = 'inline-flex';
  setStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (window.location.pathname === '/audit') openNapAudit();

function showMainDashboard() {
  document.getElementById('napAuditView').style.display = 'none';
  document.getElementById('mainDashboardView').style.display = 'block';
  document.getElementById('btnBackToDashboard').style.display = 'none';
  resetAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setStep(step) {
  ['1','2','3'].forEach(s => {
    const dot = document.getElementById('step' + s + 'Dot');
    const label = document.getElementById('step' + s + 'Label');
    dot.classList.remove('active', 'completed');
    label.classList.remove('active');
    if (parseInt(s) < step) { dot.classList.add('completed'); dot.textContent = '✓'; }
    else if (parseInt(s) === step) { dot.classList.add('active'); dot.textContent = s; label.classList.add('active'); }
    else { dot.textContent = s; }
  });
  document.getElementById('stepLine1').classList.toggle('active', step >= 2);
  document.getElementById('stepLine2').classList.toggle('active', step >= 3);
}

// Step 1: Search for business profiles
document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  currentSearchData = {
    businessName: document.getElementById('businessName').value.trim(),
    category: document.getElementById('category').value.trim(),
    address: document.getElementById('address').value.trim(),
    city: document.getElementById('city').value.trim(),
    pincode: document.getElementById('pincode').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    ownerName: document.getElementById('ownerName').value.trim(),
    website: document.getElementById('website').value.trim()
  };

  // Check at least one field has a value
  const hasAnyValue = Object.values(currentSearchData).some(v => v.length > 0);
  if (!hasAnyValue) {
    alert('Please enter at least one detail about the business to search.');
    return;
  }

  document.getElementById('formCard').style.display = 'none';
  document.getElementById('searchResultsView').style.display = 'none';
  document.getElementById('resultsContainer').style.display = 'none';
  showLoading('Searching Businesses...', 'Looking for matching businesses online.');

  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentSearchData)
    });

    const result = await resp.json();
    if (!result.success) {
      alert('Search error: ' + (result.error || 'Unknown error'));
      backToSearch();
      return;
    }

    discoveredClusters = result.clusters || [];
    selectedClusterIds = new Set();
    renderSearchResults(result.query, result.searchedQueries || [], discoveredClusters, result.diagnostics || [], result.directoryPlan || [], result.message || '');
    setStep(2);

  } catch (err) {
    alert('Search failed: ' + err.message);
    backToSearch();
  }
});

function showLoading(title, subtext) {
  document.getElementById('loadingTitle').textContent = title;
  document.getElementById('loadingSubtext').textContent = subtext;
  document.getElementById('loadingSteps').innerHTML = '';
  document.getElementById('loadingState').style.display = 'block';
}

function startLiveFeed() {
  const feed = document.getElementById('liveFeed');
  feed.style.display = 'block';
  feed.innerHTML = '';
}

function appendFeedEvent(event) {
  const feed = document.getElementById('liveFeed');
  const row = document.createElement('div');
  row.style.cssText = 'margin:0.6rem 0; padding:0.75rem; border:1px solid rgba(255,255,255,0.12); border-radius:10px; background:rgba(15,23,42,0.55);';
  if (event.type === 'finding') {
    const detail = event.detail || {};
    row.dataset.finding = JSON.stringify({ directory: event.directory, field: detail.fieldName || detail.field, currentValue: detail.foundValue || '', proposedValue: detail.sourceValue || '' });
    row.innerHTML = '<strong>Found an issue: ' + escapeHtml(event.message) + '</strong><br><span style="color:#94a3b8">Current: ' + escapeHtml(detail.foundValue || 'Not listed') + ' · Expected: ' + escapeHtml(detail.sourceValue || 'Not provided') + '</span><div style="margin-top:0.6rem"><button onclick="setFindingState(this, \'approved\')">Approve</button> <button onclick="setFindingState(this, \'skipped\')">Skip</button></div>';
  } else {
    row.textContent = event.message || 'Updating audit status...';
  }
  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
}

async function setFindingState(button, state) {
  const card = button.closest('div[style*="margin:0.6rem"]');
  if (state === 'approved') {
    const reportRef = lastReportData && lastReportData.auditReportRef;
    const finding = JSON.parse(card.dataset.finding || '{}');
    if (!reportRef || !finding.field) { alert('This audit was not saved. Please run it again before approving corrections.'); return; }
    const consent = window.confirm('I authorize AgastyaOne to apply this correction where supported.');
    if (!consent) return;
    const response = await fetch('/api/audit/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auditReportRef: reportRef, directory: finding.directory, findings: [{ field: finding.field, currentValue: finding.currentValue, proposedValue: finding.proposedValue }], consent: true }) });
    const result = await response.json();
    if (!response.ok) { alert(result.error || 'Could not approve correction.'); return; }
    button.parentElement.textContent = result.message;
  }
  card.dataset.approval = state;
  card.style.borderColor = state === 'approved' ? '#10b981' : '#64748b';
  if (state !== 'approved') button.parentElement.textContent = 'Skipped.';
}

function renderSearchResults(query, searchedQueries, clusters, diagnostics, directoryPlan, message) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('searchResultsView').style.display = 'block';
  document.getElementById('searchQueryText').textContent = query || 'Business search';
  const queryNote = document.getElementById('searchedQueriesText');
  queryNote.textContent = searchedQueries.length
    ? 'Search variations tried: ' + searchedQueries.map(query => '“' + query + '”').join(' · ')
    : '';
  const planNote = document.getElementById('directoryPlanText');
  const supported = directoryPlan.filter(directory => directory.auditStatus === 'supported').map(directory => directory.name);
  const planned = directoryPlan.filter(directory => directory.auditStatus === 'planned').map(directory => directory.name);
  planNote.textContent = directoryPlan.length
    ? 'Directory plan: audit now — ' + supported.join(', ') + (planned.length ? '. Recommended to claim/add next — ' + planned.join(', ') + '.' : '.')
    : '';
  document.getElementById('totalProfilesText').textContent = clusters.length;

  const grid = document.getElementById('profilesGrid');
  grid.innerHTML = '';

  if (clusters.length === 0) {
    const diagnosticHtml = diagnostics.length
      ? '<p style="color:#fbbf24; line-height:1.55; margin-top:0.6rem;">' + escapeHtml(diagnostics.join(' ')) + '</p>'
      : '';
    grid.innerHTML = '<p style="color:var(--text-muted); line-height:1.55;">' + escapeHtml(message || 'No confident match, try adding phone or website.') + '</p>' + diagnosticHtml;
    updateSelectionCount();
    return;
  }

  clusters.forEach(cluster => {
    const p = cluster.representative;
    const card = document.createElement('div');
    card.className = 'profile-card' + (selectedClusterIds.has(cluster.id) ? ' selected' : '');
    card.dataset.id = cluster.id;
    card.onclick = () => selectCluster(cluster.id);

    const detailLines = [];
    if (p.name) detailLines.push('<div class="profile-detail"><span class="detail-icon">🏢</span>' + escapeHtml(p.name) + '</div>');
    if (p.address) detailLines.push('<div class="profile-detail"><span class="detail-icon">📍</span>' + escapeHtml(p.address) + '</div>');
    if (p.phone) detailLines.push('<div class="profile-detail"><span class="detail-icon">📞</span>' + escapeHtml(p.phone) + '</div>');
    if (p.website) detailLines.push('<div class="profile-detail"><span class="detail-icon">🌐</span>' + escapeHtml(p.website) + '</div>');
    detailLines.push('<div class="profile-detail"><span class="detail-icon">🔗</span>Found on: ' + escapeHtml(cluster.sources.join(' · ')) + '</div>');
    detailLines.push('<div class="match-confidence">' + escapeHtml(cluster.confidence >= 0.75 ? 'Strong match — ' : 'Possible match — ') + escapeHtml((cluster.reasons || ['details are similar']).join(', ')) + '</div>');
    if (cluster.status === 'POSSIBLE_DUPLICATE_OR_OLD_LISTING') detailLines.push('<div class="match-confidence" style="color:#fbbf24;">Possible duplicate or old listing</div>');

    card.innerHTML = '<div class="profile-card-header">' +
      '<div class="profile-card-dir">' +
        '<div class="profile-card-icon">🗺️</div>' +
        '<div><div class="profile-card-dir-name">' + escapeHtml(p.name || 'Unnamed business') + '</div>' +
        '<div class="profile-card-domain">' + escapeHtml(cluster.members.length + ' source record(s)') + '</div></div>' +
      '</div>' +
      '<input type="checkbox" class="profile-select-check" ' + (selectedClusterIds.has(cluster.id) ? 'checked' : '') + ' onclick="event.stopPropagation(); selectCluster(\'' + escapeHtml(cluster.id) + '\')">' +
    '</div>' +
    '<div class="profile-card-body">' + detailLines.join('') + '</div>' +
    (p.searchUrl ? '<a href="' + encodeURI(p.searchUrl) + '" target="_blank" rel="noopener noreferrer" class="profile-card-link" onclick="event.stopPropagation()">View source →</a>' : '');

    grid.appendChild(card);
  });

  updateSelectionCount();
}

function selectCluster(id) {
  if (selectedClusterIds.has(id)) selectedClusterIds.delete(id);
  else selectedClusterIds.add(id);
  document.querySelectorAll('.profile-card').forEach(card => {
    card.classList.toggle('selected', selectedClusterIds.has(card.dataset.id));
  });
  updateSelectionCount();
}

function updateSelectionCount() {
  const count = selectedClusterIds.size;
  document.getElementById('selectedCountText').textContent = count;
  document.getElementById('btnRunAudit').disabled = count === 0;
}

function backToSearch() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('searchResultsView').style.display = 'none';
  document.getElementById('resultsContainer').style.display = 'none';
  document.getElementById('formCard').style.display = 'block';
  setStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Step 3: Run audit on selected profiles
async function runAuditOnSelected() {
  const selectedClusters = discoveredClusters.filter((cluster) => selectedClusterIds.has(cluster.id));
  if (!selectedClusters.length) return;
  const primaryCluster = selectedClusters.find((cluster) => cluster.status === 'PRIMARY_MATCH') || selectedClusters[0];
  const selectedBusiness = primaryCluster.representative;

  document.getElementById('searchResultsView').style.display = 'none';
  showLoading('Scanning Directory Listings...', 'Your confirmed business is now the source of truth. Checking Google, Justdial, Practo, Lybrate, and Sulekha.');
  startLiveFeed();
  setStep(3);

  // Build source-of-truth from user-provided data
  const auditData = {
    businessName: selectedBusiness.name || currentSearchData.businessName || '',
    category: selectedBusiness.category || currentSearchData.category || '',
    address: selectedBusiness.address || currentSearchData.address || '',
    city: currentSearchData.city || '',
    pincode: currentSearchData.pincode || '',
    phone: selectedBusiness.phone || currentSearchData.phone || '',
    website: selectedBusiness.website || currentSearchData.website || '',
    selectedClusters
  };

  const stream = new EventSource('/api/audit/stream?payload=' + encodeURIComponent(JSON.stringify(auditData)));
  stream.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.type === 'complete') {
      stream.close();
      lastReportData = event.report;
      lastMarkdownReport = event.markdownReport;
      renderResults(event.report);
      return;
    }
    if (event.type === 'error') {
      stream.close();
      appendFeedEvent({ message: 'Something went wrong. Please retry the audit.' });
      return;
    }
    appendFeedEvent(event);
  };
  stream.onerror = () => {
    if (stream.readyState !== EventSource.CLOSED) {
      stream.close();
      appendFeedEvent({ message: 'Connection dropped. Please retry the audit.' });
    }
  };
}

function renderResults(report) {
  if (document.getElementById('liveFeed').style.display === 'none') document.getElementById('loadingState').style.display = 'none';
  document.getElementById('resultsContainer').style.display = 'block';

  const score = report.auditScore;
  document.getElementById('scoreValue').textContent = score + '%';
  document.getElementById('scoreCircle').style.setProperty('--score', score);

  document.getElementById('statChecked').textContent = report.totalDirectoriesChecked;
  document.getElementById('statConsistent').textContent = report.consistentCount;
  document.getElementById('statInconsistent').textContent = report.inconsistentCount;
  document.getElementById('statMissing').textContent = report.missingCount;

  const listEl = document.getElementById('directoryCardsList');
  listEl.innerHTML = '';

  report.results.forEach(res => {
    const card = document.createElement('div');
    card.className = 'dir-card';

    let diffRows = '';
    if (res.diffs && res.diffs.length > 0) {
      res.diffs.forEach(d => {
        const fieldNameStr = d.fieldName || d.field || 'field';
        const sourceVal = d.sourceValue !== undefined ? d.sourceValue : (d.expectedValue || '');
        const foundVal = d.foundValue !== undefined ? d.foundValue : (d.actualValue || '');
        const matchSymbol = d.matchStatus === 'EXACT' ? '✓' : (d.matchStatus === 'DRIFT' ? '⚠' : '✗');
        diffRows += '<tr>' +
          '<td><strong>' + escapeHtml(fieldNameStr.toUpperCase()) + '</strong></td>' +
          '<td>' + (sourceVal ? escapeHtml(sourceVal) : '<em style="color:#64748b">None</em>') + '</td>' +
          '<td>' + (foundVal ? escapeHtml(foundVal) : '<em style="color:#64748b">Not Listed</em>') + '</td>' +
          '<td class="match-icon match-' + escapeHtml(d.matchStatus) + '">' + matchSymbol + ' ' + escapeHtml(d.matchStatus) + '</td>' +
        '</tr>';
      });
    }

    var errHtml = res.errorMessage ? ('<p style="color:#f87171; font-size:0.85rem;">Error: ' + escapeHtml(res.errorMessage) + '</p>') : '';
    var tableHtml = diffRows ? ('<table class="diff-table"><thead><tr><th>Field</th><th>Source of Truth</th><th>Listed Value</th><th>Match</th></tr></thead><tbody>' + diffRows + '</tbody></table>') : '<p style="color:var(--text-muted); font-size:0.85rem;">No profile listing found on this directory.</p>';
    card.innerHTML = '<div class="dir-header"><span class="dir-name">' + escapeHtml(res.directoryName) + '</span><span class="status-badge badge-' + escapeHtml(res.status) + '">' + escapeHtml(res.status) + ' (' + escapeHtml(res.overallConfidence) + '% Match)</span></div>' + errHtml + tableHtml;

    listEl.appendChild(card);
  });
}

function resetAll() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('resultsContainer').style.display = 'none';
  document.getElementById('searchResultsView').style.display = 'none';
  document.getElementById('formCard').style.display = 'block';
  discoveredClusters = [];
  selectedClusterIds = new Set();
  currentSearchData = {};
  setStep(1);
}

function resetForm() {
  resetAll();
}

function copyMarkdownReport() {
  if (lastMarkdownReport) {
    navigator.clipboard.writeText(lastMarkdownReport);
    alert('Markdown report copied to clipboard!');
  }
}

function copyClientReportLink() {
  if (!lastReportData || !lastReportData.auditReportRef) {
    alert('No shareable link yet — Supabase must be configured to save this report before it can be linked.');
    return;
  }
  const url = window.location.origin + '/report/' + lastReportData.auditReportRef;
  navigator.clipboard.writeText(url);
  alert('Client report link copied: ' + url);
}

function downloadJSONReport() {
  if (lastReportData) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lastReportData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", 'nap-audit-' + (lastReportData.businessInfo.businessName || 'report').replace(/\\s+/g, '-') + '.json');
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }
}
</script>

</body>
</html>`;

const getLoginHTML = ({ error, next }: { error: boolean; next: string }) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in | Nexus Suite</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --bg-gradient: radial-gradient(circle at 50% -10%, #1e1b4b 0%, #0f172a 60%, #090d16 100%); --card-bg: rgba(30, 41, 59, 0.75); --card-border: rgba(255, 255, 255, 0.1); --primary: #6366f1; --primary-hover: #4f46e5; --text-main: #f8fafc; --text-muted: #94a3b8; --inconsistent: #ef4444; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg-gradient); color: var(--text-main); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { width: 100%; max-width: 380px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 1rem; padding: 2.25rem; backdrop-filter: blur(16px); }
    h1 { font-family: 'Outfit', sans-serif; font-size: 1.5rem; margin-bottom: 0.25rem; }
    p.sub { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.4rem; }
    input { width: 100%; padding: 0.75rem 0.9rem; border-radius: 0.6rem; border: 1px solid var(--card-border); background: rgba(15, 23, 42, 0.6); color: var(--text-main); font-size: 0.95rem; margin-bottom: 1.1rem; }
    input:focus { outline: 2px solid var(--primary); outline-offset: 1px; }
    button { width: 100%; padding: 0.8rem; border: none; border-radius: 0.6rem; background: var(--primary); color: #fff; font-weight: 600; font-size: 0.95rem; cursor: pointer; }
    button:hover { background: var(--primary-hover); }
    .error { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); color: #fecaca; padding: 0.6rem 0.8rem; border-radius: 0.5rem; font-size: 0.85rem; margin-bottom: 1.1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Nexus Suite</h1>
    <p class="sub">Sign in to the audit &amp; operations command center.</p>
    ${error ? '<div class="error">Incorrect password. Try again.</div>' : ''}
    <form method="POST" action="/login">
      <input type="hidden" name="next" value="${next.replace(/"/g, '&quot;')}">
      <label for="password">Operator password</label>
      <input type="password" id="password" name="password" autofocus required>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`;

function scoreBand(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Excellent', color: '#10b981' };
  if (score >= 70) return { label: 'Good', color: '#10b981' };
  if (score >= 50) return { label: 'Needs Attention', color: '#f59e0b' };
  return { label: 'Critical', color: '#ef4444' };
}

function statusMeta(status: string): { icon: string; color: string } {
  switch (status) {
    case 'CONSISTENT': return { icon: '✅', color: '#10b981' };
    case 'DRIFT': return { icon: '⚠️', color: '#f59e0b' };
    case 'INCONSISTENT':
    case 'MISMATCH': return { icon: '❌', color: '#ef4444' };
    default: return { icon: '🔍', color: '#6b7280' };
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

const getClientReportHTML = (report: NAPAuditReport, meta: { id: string; createdAt: string }) => {
  const band = scoreBand(report.auditScore);
  const driftCount = report.results.filter((r) => r.status === 'DRIFT').length;
  const tiles = [
    { label: 'Directories Audited', value: report.totalDirectoriesChecked, color: '#6366f1' },
    { label: 'Consistent', value: report.consistentCount, color: '#10b981' },
    { label: 'Minor Drift', value: driftCount, color: '#f59e0b' },
    { label: 'Inconsistent', value: report.inconsistentCount, color: '#ef4444' },
    { label: 'Missing', value: report.missingCount, color: '#6b7280' }
  ];

  const directoryRows = report.results.map((res) => {
    const status = statusMeta(res.status);
    const diffRows = res.diffs.length
      ? res.diffs.map((diff) => {
          const diffStatus = statusMeta(diff.matchStatus);
          return `<tr><td>${escapeHtml(diff.fieldName)}</td><td>${escapeHtml(diff.sourceValue)}</td><td>${escapeHtml(diff.foundValue) || '<em>missing</em>'}</td><td><span class="pill" style="--pill-color:${diffStatus.color}">${diffStatus.icon} ${escapeHtml(diff.matchStatus)}</span></td></tr>`;
        }).join('')
      : `<tr><td colspan="4" class="muted">No active listing detected. Recommended for a Phase 2 submission.</td></tr>`;
    return `
    <section class="directory">
      <h3><span class="pill" style="--pill-color:${status.color}">${status.icon} ${escapeHtml(res.status)}</span> ${escapeHtml(res.directoryName)}${res.listingUrl ? ` — <a href="${escapeHtml(res.listingUrl)}" target="_blank" rel="noopener">View listing</a>` : ''}</h3>
      <table>
        <thead><tr><th>Field</th><th>Source of truth</th><th>Found value</th><th>Match</th></tr></thead>
        <tbody>${diffRows}</tbody>
      </table>
    </section>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.businessInfo.businessName)} | Citation & NAP Audit Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #0f172a; --card-bg: rgba(30, 41, 59, 0.65); --card-border: rgba(255,255,255,0.1); --text-main: #f8fafc; --text-muted: #94a3b8; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: radial-gradient(circle at 50% -10%, #1e1b4b 0%, #0f172a 60%, #090d16 100%); color: var(--text-main); padding: 2rem 1.25rem 4rem; }
    .wrap { max-width: 880px; margin: 0 auto; }
    header.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.75rem; flex-wrap: wrap; }
    .brand { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 1.05rem; color: var(--text-muted); letter-spacing: 0.02em; }
    h1 { font-family: 'Outfit', sans-serif; font-size: 1.75rem; margin-top: 0.2rem; }
    .meta { color: var(--text-muted); font-size: 0.85rem; margin-top: 0.35rem; }
    button.print-btn { border: 1px solid var(--card-border); background: rgba(99,102,241,0.15); color: var(--text-main); padding: 0.6rem 1.1rem; border-radius: 0.6rem; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
    button.print-btn:hover { background: rgba(99,102,241,0.28); }
    .hero { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 1rem; padding: 1.75rem; display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .hero .score { font-family: 'Outfit', sans-serif; font-size: 3rem; font-weight: 800; color: ${band.color}; line-height: 1; }
    .hero .score-label { font-weight: 700; color: ${band.color}; font-size: 1rem; }
    .hero .score-sub { color: var(--text-muted); font-size: 0.85rem; margin-top: 0.15rem; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; margin-bottom: 2rem; }
    .tile { background: var(--card-bg); border: 1px solid var(--card-border); border-left: 3px solid var(--tile-color); border-radius: 0.75rem; padding: 0.9rem 1rem; }
    .tile .value { font-family: 'Outfit', sans-serif; font-size: 1.5rem; font-weight: 700; }
    .tile .label { color: var(--text-muted); font-size: 0.78rem; margin-top: 0.15rem; }
    .directory { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 0.9rem; padding: 1.1rem 1.25rem; margin-bottom: 1rem; }
    .directory h3 { font-family: 'Outfit', sans-serif; font-size: 1rem; margin-bottom: 0.75rem; font-weight: 600; }
    .directory a { color: #a5b4fc; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; color: var(--text-muted); font-weight: 600; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--card-border); }
    td { padding: 0.5rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
    td.muted { color: var(--text-muted); font-style: italic; }
    .pill { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: color-mix(in srgb, var(--pill-color) 18%, transparent); color: var(--pill-color); }
    footer { text-align: center; color: var(--text-muted); font-size: 0.8rem; margin-top: 2.5rem; }
    @media print {
      body { background: #fff; color: #0f172a; padding: 0.5in; }
      .brand, .meta, .score-sub, .directory a { color: #475569; }
      .hero, .tile, .directory { background: #fff; border-color: #e2e8f0; }
      .print-btn { display: none; }
      table { font-size: 0.8rem; }
      th { color: #475569; }
      td { border-bottom-color: #e2e8f0; }
      .directory { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="top">
      <div>
        <div class="brand">NEXUS SUITE — AGASTYAONE</div>
        <h1>${escapeHtml(report.businessInfo.businessName)}</h1>
        <div class="meta">${escapeHtml(report.businessInfo.address)}${report.businessInfo.city ? `, ${escapeHtml(report.businessInfo.city)}` : ''} · Generated ${escapeHtml(new Date(meta.createdAt).toLocaleString())}</div>
      </div>
      <button class="print-btn" onclick="window.print()">Download PDF</button>
    </header>

    <div class="hero">
      <div class="score">${report.auditScore}%</div>
      <div>
        <div class="score-label">${band.label} Citation Health</div>
        <div class="score-sub">Listing completeness: ${Math.round(report.completenessScore * 100)}%</div>
      </div>
    </div>

    <div class="tiles">
      ${tiles.map((tile) => `<div class="tile" style="--tile-color:${tile.color}"><div class="value">${tile.value}</div><div class="label">${escapeHtml(tile.label)}</div></div>`).join('')}
    </div>

    ${directoryRows}

    <footer>Report ID ${escapeHtml(meta.id)} · This link is shareable but unguessable — do not post it publicly.</footer>
  </div>
</body>
</html>`;
};

app.get('/report/:id', async (req: Request, res: Response) => {
  const supabase = getSupabaseClient();
  if (!supabase) return res.status(503).send('Reports require Supabase to be configured on this deployment.');
  const { data, error } = await supabase.from('dashboard_audit_reports').select('id, report_json, created_at').eq('id', req.params.id).single();
  if (error || !data) return res.status(404).send('Report not found. Check the link and try again.');
  res.send(getClientReportHTML(data.report_json as NAPAuditReport, { id: data.id, createdAt: data.created_at }));
});

app.get('/audit', (req: Request, res: Response) => {
  res.send(getDashboardHTML());
});

app.get('*', (req: Request, res: Response) => {
  res.send(getDashboardHTML());
});

if (!process.env.VERCEL && !process.env.NOW_REGION) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🌐 Nexus Suite Command Center is running!`);
    console.log(`📍 Main Dashboard: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

export default app;
