import { BaseDirectoryProvider } from './baseDirectory';
import { SourceOfTruthNAP, ScrapedListing } from '../types/nap';
import { BrowserFactory } from '../utils/browser';
import { extractDirectoryFields } from './scanExtraction';

const PRACTO_CITY_SLUGS: Record<string, string> = {
  bengaluru: 'bangalore', bangalore: 'bangalore',
  mumbai: 'mumbai', bombay: 'mumbai',
  delhi: 'delhi', 'new delhi': 'delhi',
  chennai: 'chennai', madras: 'chennai',
  kolkata: 'kolkata', calcutta: 'kolkata',
  hyderabad: 'hyderabad', pune: 'pune', ahmedabad: 'ahmedabad'
};

function practoCitySlug(city: string): string {
  const normalized = city.trim().toLowerCase();
  return PRACTO_CITY_SLUGS[normalized] || normalized.replace(/\s+/g, '-') || 'bangalore';
}

export class PractoDirectoryProvider extends BaseDirectoryProvider {
  readonly directoryId = 'practo';
  readonly directoryName = 'Practo';
  readonly domain = 'practo.com';

  async searchAndScrape(
    source: SourceOfTruthNAP,
    options?: { pageTimeout?: number }
  ): Promise<ScrapedListing | null> {
    // Practo's search API previously used a query-string form
    // (/search/clinics?results_type=clinic&q=...&city=...) that now returns
    // HTTP 400 — the site moved to a path-based city segment instead.
    const citySlug = practoCitySlug(source.city || '');
    const searchUrl = `https://www.practo.com/${citySlug}/clinics/search?q=${encodeURIComponent(source.businessName || '')}`;

    let browser;
    try {
      ({ browser } = await BrowserFactory.getBrowser());
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: options?.pageTimeout || 15000 });
      // Practo's server-rendered HTML ships an empty result list; the actual
      // clinic cards load via a client-side fetch after hydration. Wait for
      // a plausible result element (or network to settle) before extracting.
      const nameSelector = '.clinic-name, h2[data-qa-id="clinic_name"], .c-clinic-listingV2, [data-qa-id*="clinic"]';
      await Promise.race([
        page.waitForSelector(nameSelector, { timeout: 10000 }).catch(() => {}),
        page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      ]);

      const fields = await extractDirectoryFields(page, page.url(), { name: nameSelector, address: '.locality-address, [data-qa-id="clinic_locality"]', phone: '.phone-number, [data-qa-id="clinic_phone"]', category: '.speciality, .clinic-speciality', hours: '.clinic-timings, .hours', photos: 'img[src]', description: '.clinic-description, .about', attributes: '.services, .amenities' });
      const listingUrl = page.url();

      if (!fields.name && !fields.address) {
        return null;
      }

      return {
        directoryId: this.directoryId,
        directoryName: this.directoryName,
        listingUrl,
        foundName: fields.name, foundAddress: fields.address, foundPhone: fields.phone, foundWebsite: fields.website, foundCategory: fields.category, completeness: fields.completeness, claimStatus: fields.claimStatus, as_of: new Date().toISOString()
      };
    } catch (err: any) {
      // Do NOT fall back to source-of-truth data here — that would report a
      // scrape failure as a "found, consistent" listing, which is worse than
      // useless for a NAP audit. Surface the failure so it shows as ERROR.
      throw new Error(`Practo scrape failed: ${err.message || err}`);
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
