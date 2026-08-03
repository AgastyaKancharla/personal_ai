import { CONFIG } from '../../config/env';
import { BusinessQuery, DiscoverySource, RawCandidate } from '../types';

interface OpenStreetMapPlace {
  osm_type?: 'node' | 'way' | 'relation';
  osm_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  namedetails?: { name?: string };
  address?: Record<string, string>;
  extratags?: Record<string, string>;
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
const CITY_ALIASES: Record<string, string[]> = { bangalore: ['Bengaluru'], bengaluru: ['Bangalore'] };

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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
  nextNominatimRequestAt = Date.now() + 1100;
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '10', addressdetails: '1', namedetails: '1', extratags: '1' });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: 'application/json', 'User-Agent': CONFIG.OSM_USER_AGENT }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const places = await response.json() as OpenStreetMapPlace[];
  nominatimCache.set(query, { places, expiresAt: Date.now() + 15 * 60 * 1000 });
  return places;
}

export class OpenStreetMapSource implements DiscoverySource {
  readonly name = 'osm';
  readonly priority = 20;

  isConfigured(): boolean {
    return true;
  }

  async search(query: BusinessQuery): Promise<RawCandidate[]> {
    if (!CONFIG.ENABLE_OSM_DISCOVERY) return [];
    const name = clean(query.name || '');
    const city = clean(query.city || '');
    const address = clean(query.address || '');
    if (!name && !address) return [];
    const places = await nominatimSearch(clean([name, address, city].filter(Boolean).join(' ')));
    const candidates = places
      .filter((place) => place.osm_id && (place.namedetails?.name || place.display_name))
      .slice(0, 10)
      .map((place): RawCandidate => ({
        source: this.name,
        name: place.namedetails?.name || place.display_name?.split(',')[0].trim() || name,
        address: place.display_name || Object.values(place.address || {}).join(', '),
        searchUrl: openStreetMapUrl(place), directoryName: 'OpenStreetMap', domain: 'openstreetmap.org',
        phone: place.extratags?.phone || place.extratags?.['contact:phone'] || '',
        website: place.extratags?.website || place.extratags?.['contact:website'] || '',
        lat: place.lat ? Number(place.lat) : undefined, lng: place.lon ? Number(place.lon) : undefined, raw: place
      }));
    if (candidates.length || !name || !city) return candidates;

    const cities = [city, ...(CITY_ALIASES[city.toLowerCase()] || [])].map(escapeOverpassRegex).join('|');
    const overpassQuery = `[out:json][timeout:12];area["boundary"="administrative"]["name"~"^(${cities})$",i]->.searchArea;(nwr["name"~"^${escapeOverpassRegex(name)}$",i](area.searchArea););out center 10;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': CONFIG.OSM_USER_AGENT },
      body: new URLSearchParams({ data: overpassQuery }), signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
    const payload = await response.json() as { elements?: OverpassElement[] };
    return (payload.elements || []).slice(0, 10).map((element): RawCandidate => {
      const tags = element.tags || {};
      const lat = element.lat ?? element.center?.lat;
      const lng = element.lon ?? element.center?.lon;
      const addressText = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ');
      return {
        source: this.name, name: tags.name || name, address: addressText || city,
        searchUrl: lat !== undefined && lng !== undefined ? `https://www.openstreetmap.org/${element.type}/${element.id}#map=18/${lat}/${lng}` : `https://www.openstreetmap.org/${element.type}/${element.id}`,
        directoryName: 'OpenStreetMap (Overpass)', domain: 'openstreetmap.org',
        phone: tags.phone || tags['contact:phone'] || '', website: tags.website || tags['contact:website'] || '', lat, lng, raw: element
      };
    });
  }
}
