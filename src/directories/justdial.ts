import { BaseDirectoryProvider } from './baseDirectory';
import { SourceOfTruthNAP, ScrapedListing } from '../types/nap';
import { BrowserFactory } from '../utils/browser';
import { extractDirectoryFields } from './scanExtraction';

export class JustdialDirectoryProvider extends BaseDirectoryProvider {
  readonly directoryId = 'justdial';
  readonly directoryName = 'Justdial';
  readonly domain = 'justdial.com';

  async searchAndScrape(
    source: SourceOfTruthNAP,
    options?: { pageTimeout?: number }
  ): Promise<ScrapedListing | null> {
    const searchQuery = `${source.businessName || ''} ${source.city || ''}`.trim();
    const searchUrl = `https://www.justdial.com/${(source.city || 'india').toLowerCase()}/search?q=${encodeURIComponent(searchQuery)}`;

    let browser;
    try {
      ({ browser } = await BrowserFactory.getBrowser());
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });
      const page = await context.newPage();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: options?.pageTimeout || 15000 });
      // Justdial's search results render client-side after an XHR fetch, so
      // the page is still an empty shell right after domcontentloaded.
      // Wait for a plausible result element (or network to settle) before
      // extracting — but don't fail the whole scrape if neither shows up in
      // time, since the extraction below has its own not-found handling.
      const titleSelector = '.store-name, .jsx-3098522197, h2, .lng_cont_name, .resultbox_title, [class*="store-name"]';
      const addressSelector = '.cont_fl_addr, .address-info, .address, .locatcity, [class*="address"]';
      const phoneSelector = '.contact-info, .mobilesv, .call-now, [class*="callcontent"]';
      await Promise.race([
        page.waitForSelector(titleSelector, { timeout: 10000 }).catch(() => {}),
        page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      ]);

      const fields = await extractDirectoryFields(page, page.url(), { name: titleSelector, address: addressSelector, phone: phoneSelector, category: '.category, .cat-name', hours: '.working-hours, .hours', photos: 'img[src]', description: '.description, .about', attributes: '.amenities, .attributes' });
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
      throw new Error(`Justdial scrape failed: ${err.message || err}`);
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
