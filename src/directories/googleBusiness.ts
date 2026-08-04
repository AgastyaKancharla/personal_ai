import { BaseDirectoryProvider } from './baseDirectory';
import { SourceOfTruthNAP, ScrapedListing } from '../types/nap';
import { BrowserFactory } from '../utils/browser';
import { extractDirectoryFields } from './scanExtraction';

export class GoogleBusinessDirectoryProvider extends BaseDirectoryProvider {
  readonly directoryId = 'google_business';
  readonly directoryName = 'Google Business Profile / Maps';
  readonly domain = 'google.com/maps';

  async searchAndScrape(
    source: SourceOfTruthNAP,
    options?: { pageTimeout?: number }
  ): Promise<ScrapedListing | null> {
    const searchQuery = `${source.businessName || ''} ${source.address || ''} ${source.city || ''}`.replace(/\s+/g, ' ').trim();
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

    let browser;
    try {
      ({ browser } = await BrowserFactory.getBrowser());
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: options?.pageTimeout || 15000 });
      // Even a direct place-page hit renders its name first and the
      // address/phone detail panel a beat later — extracting right after
      // domcontentloaded can catch the name but miss those fields. Wait for
      // the detail panel (or network to settle) before reading anything.
      await Promise.race([
        page.waitForSelector('button[data-item-id="address"], button[data-item-id^="phone"]', { timeout: 10000 }).catch(() => {}),
        page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      ]);

      const fields = await extractDirectoryFields(page, page.url(), { name: 'h1.DUwif, h1.fontHeadlineLarge, h1', address: 'button[data-item-id="address"] .Io6fl3', phone: 'button[data-item-id^="phone"] .Io6fl3', website: 'a[data-item-id="authority"] .Io6fl3', category: 'button[jsaction*="category"]', hours: '[data-item-id="oh"]', photos: 'button[aria-label*="Photos"]', description: '[data-item-id="summary"]', attributes: '[data-item-id*="attribute"]' });
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
      throw new Error(`Google Business Profile scrape failed: ${err.message || err}`);
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
