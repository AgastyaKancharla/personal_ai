import { BusinessQuery, DiscoverySource, RawCandidate } from '../types';

interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

function hostnameOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export class GoogleCseSource implements DiscoverySource {
  readonly name = 'google_cse';
  readonly priority = 30;

  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID);
  }

  async search(query: BusinessQuery): Promise<RawCandidate[]> {
    const key = process.env.GOOGLE_CSE_KEY || '';
    const cx = process.env.GOOGLE_CSE_ID || '';
    const searchQueries = query.searchQueries || [query.name, query.phone, query.website].filter(Boolean) as string[];
    const candidates: RawCandidate[] = [];
    const seenUrls = new Set<string>();

    for (const searchQuery of searchQueries) {
      try {
        const params = new URLSearchParams({ key, cx, q: searchQuery, num: '10' });
        const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { items?: GoogleCseItem[] };
        for (const item of payload.items || []) {
          const name = (item.title || '').trim();
          const link = item.link || '';
          if (!name || !link || seenUrls.has(link)) continue;
          candidates.push({
            source: this.name,
            name,
            address: item.snippet || '',
            searchUrl: link,
            directoryName: 'Google Search',
            domain: item.displayLink || hostnameOf(link)
          });
          seenUrls.add(link);
        }
      } catch (error: any) {
        console.warn(`Google CSE search failed for "${searchQuery}": ${error.message || error}`);
      }
    }
    return candidates;
  }
}
