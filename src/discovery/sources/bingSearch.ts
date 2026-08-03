import { BusinessQuery, DiscoverySource, RawCandidate } from '../types';

export class BingSearchSource implements DiscoverySource {
  readonly name = 'bing_search';
  readonly priority = 40;

  isConfigured(): boolean {
    return Boolean(process.env.BING_SEARCH_KEY);
  }

  async search(_query: BusinessQuery): Promise<RawCandidate[]> {
    return [];
  }
}
