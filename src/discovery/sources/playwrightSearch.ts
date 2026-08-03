import { BrowserFactory } from '../../utils/browser';
import { BusinessQuery, DiscoverySource, RawCandidate } from '../types';

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

async function dismissGoogleConsent(page: import('playwright-core').Page): Promise<void> {
  const buttons = page.getByRole('button', { name: /accept all|i agree|accept/i });
  if (await buttons.count()) await buttons.first().click({ timeout: 1500 }).catch(() => {});
}

export class PlaywrightSearchSource implements DiscoverySource {
  readonly name = 'playwright_search';
  readonly priority = 100;

  isConfigured(): boolean {
    return true;
  }

  async search(query: BusinessQuery): Promise<RawCandidate[]> {
    const searchQueries = query.searchQueries || [query.name, query.phone, query.website].filter(Boolean) as string[];
    let browser;
    try {
      ({ browser } = await BrowserFactory.getBrowser());
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const candidates: RawCandidate[] = [];
      const seenUrls = new Set<string>();
      const page = await context.newPage();

      for (const searchQuery of searchQueries) {
        try {
          await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await dismissGoogleConsent(page);
          await page.waitForSelector('h1.fontHeadlineLarge, h1.DUwif, a.hfpxzc, a[href*="/maps/place/"]', { timeout: 5000 }).catch(() => {});
        } catch (error: any) {
          console.warn(`Google Maps could not load “${searchQuery}”: ${error.message || error}`);
        }

        const directName = (await page.locator('h1.fontHeadlineLarge, h1.DUwif').first().innerText().catch(() => '')).trim();
        const directAddress = (await page.locator('button[data-item-id="address"], [data-item-id="address"] .Io6fl3').first().innerText().catch(() => '')).trim();
        const directPhone = (await page.locator('button[data-item-id^="phone"]').first().innerText().catch(() => '')).trim();
        const directWebsite = await page.locator('a[data-item-id="authority"]').first().getAttribute('href').catch(() => '');
        if (isUsefulGoogleBusinessName(directName)) {
          const searchUrl = page.url();
          candidates.push({ source: 'playwright_maps', name: directName, address: directAddress, searchUrl, directoryName: 'Google Maps', domain: 'google.com/maps', phone: directPhone, website: directWebsite || '' });
          seenUrls.add(searchUrl);
        }

        const links = page.locator('a.hfpxzc, a[href*="/maps/place/"]');
        const count = Math.min(await links.count(), 10);
        for (let index = 0; index < count; index += 1) {
          const link = links.nth(index);
          const href = await link.getAttribute('href');
          const label = (await link.getAttribute('aria-label')) || (await link.innerText().catch(() => ''));
          const searchUrl = unwrapGoogleResultUrl(href || '');
          if (!searchUrl || !label || seenUrls.has(searchUrl)) continue;
          const cardText = await link.locator('xpath=ancestor::div[@role="article"][1]').innerText().catch(async () => link.locator('xpath=../..').innerText().catch(() => ''));
          const address = cardText.split('\n').map((line) => line.trim()).filter(Boolean).slice(1, 4).join(', ');
          candidates.push({ source: 'playwright_maps', name: label.trim(), address, searchUrl, directoryName: 'Google Maps', domain: 'google.com/maps' });
          seenUrls.add(searchUrl);
        }

        try {
          await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await dismissGoogleConsent(page);
          await page.waitForSelector('a:has(h3)', { timeout: 4000 }).catch(() => {});
        } catch (error: any) {
          console.warn(`Google Search could not load “${searchQuery}”: ${error.message || error}`);
          continue;
        }
        const resultLinks = page.locator('a:has(h3)');
        const resultCount = Math.min(await resultLinks.count(), 10);
        for (let index = 0; index < resultCount; index += 1) {
          const link = resultLinks.nth(index);
          const rawHref = await link.getAttribute('href');
          const name = (await link.locator('h3').innerText().catch(() => '')).trim();
          const searchUrl = rawHref ? unwrapGoogleResultUrl(rawHref) : '';
          if (!searchUrl || !name || seenUrls.has(searchUrl) || !/^https?:\/\//.test(searchUrl)) continue;
          const resultText = await link.locator('xpath=../../..').innerText().catch(() => '');
          const address = resultText.replace(name, '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 3).join(', ');
          candidates.push({ source: 'playwright_search', name, address, searchUrl, directoryName: 'Google Search', domain: new URL(searchUrl).hostname.replace(/^www\./, '') });
          seenUrls.add(searchUrl);
        }
      }
      await context.close();
      return candidates;
    } catch (error: any) {
      console.warn(`Browser discovery is unavailable: ${error.message || error}`);
      return [];
    } finally {
      await browser?.close().catch(() => {});
    }
  }
}
