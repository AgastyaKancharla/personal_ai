import { BusinessQuery, DiscoverySource, RawCandidate } from '../types';

export class GoogleCseSource implements DiscoverySource {
  readonly name = 'google_cse';
  readonly priority = 30;

  isConfigured(): boolean {
    return Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID);
  }

  async search(_query: BusinessQuery): Promise<RawCandidate[]> {
    return [];
  }
}
