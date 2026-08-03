import { BusinessQuery, DiscoverySource, RawCandidate } from '../types';

interface BingWebPage {
  name?: string;
  url?: string;
  snippet?: string;
  displayUrl?: string;
}

function hostnameOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export class BingSearchSource implements DiscoverySource {
  readonly name = 'bing_search';
  readonly priority = 40;

  isConfigured(): boolean {
    return Boolean(process.env.BING_SEARCH_KEY);
  }

  async search(query: BusinessQuery): Promise<RawCandidate[]> {
    const key = process.env.BING_SEARCH_KEY || '';
    const searchQueries = query.searchQueries || [query.name, query.phone, query.website].filter(Boolean) as string[];
    const candidates: RawCandidate[] = [];
    const seenUrls = new Set<string>();

    for (const searchQuery of searchQueries) {
      try {
        const params = new URLSearchParams({ q: searchQuery, mkt: 'en-IN', count: '10', responseFilter: 'Webpages' });
        const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?${params}`, {
          headers: { 'Ocp-Apim-Subscription-Key': key },
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { webPages?: { value?: BingWebPage[] } };
        for (const page of payload.webPages?.value || []) {
          const name = (page.name || '').trim();
          const link = page.url || '';
          if (!name || !link || seenUrls.has(link)) continue;
          candidates.push({
            source: this.name,
            name,
            address: page.snippet || '',
            searchUrl: link,
            directoryName: 'Bing Search',
            domain: page.displayUrl || hostnameOf(link)
          });
          seenUrls.add(link);
        }
      } catch (error: any) {
        console.warn(`Bing search failed for "${searchQuery}": ${error.message || error}`);
      }
    }
    return candidates;
  }
}
