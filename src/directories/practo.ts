import { BaseDirectoryProvider } from './baseDirectory';
import { SourceOfTruthNAP, ScrapedListing } from '../types/nap';
import { BrowserFactory } from '../utils/browser';
import { extractDirectoryFields } from './scanExtraction';

export class PractoDirectoryProvider extends BaseDirectoryProvider {
  readonly directoryId = 'practo';
  readonly directoryName = 'Practo';
  readonly domain = 'practo.com';

  async searchAndScrape(
    source: SourceOfTruthNAP,
    options?: { pageTimeout?: number }
  ): Promise<ScrapedListing | null> {
    const searchQuery = `${source.businessName || ''} ${source.city || ''}`.trim();
    const searchUrl = `https://www.practo.com/search/clinics?results_type=clinic&q=${encodeURIComponent(searchQuery)}&city=${encodeURIComponent(source.city || '')}`;

    let browser;
    try {
      ({ browser } = await BrowserFactory.getBrowser());
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: options?.pageTimeout || 15000 });

      const fields = await extractDirectoryFields(page, page.url(), { name: '.clinic-name, h2[data-qa-id="clinic_name"]', address: '.locality-address, [data-qa-id="clinic_locality"]', phone: '.phone-number, [data-qa-id="clinic_phone"]', category: '.speciality, .clinic-speciality', hours: '.clinic-timings, .hours', photos: 'img[src]', description: '.clinic-description, .about', attributes: '.services, .amenities' });
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
