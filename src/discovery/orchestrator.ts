import { BingSearchSource } from './sources/bingSearch';
import { GoogleCseSource } from './sources/googleCse';
import { GooglePlacesSource } from './sources/googlePlaces';
import { OpenStreetMapSource } from './sources/osm';
import { PlaywrightSearchSource } from './sources/playwrightSearch';
import { BusinessQuery, DiscoverySource, RawCandidate } from './types';

const sources: DiscoverySource[] = [
  new GooglePlacesSource(),
  new OpenStreetMapSource(),
  new GoogleCseSource(),
  new BingSearchSource(),
  new PlaywrightSearchSource()
];

export async function discover(query: BusinessQuery, options: { forcePlaywright?: boolean } = {}): Promise<RawCandidate[]> {
  const sortedSources = [...sources].sort((a, b) => a.priority - b.priority);
  const playwrightSource = sortedSources.find((source) => source instanceof PlaywrightSearchSource);
  const primarySources = sortedSources.filter((source) => source !== playwrightSource);
  const activePrimarySources = primarySources.filter((source) => source.isConfigured());
  const skippedPrimarySources = primarySources.filter((source) => !source.isConfigured());

  console.log(`Discovery sources running: ${activePrimarySources.map((source) => source.name).join(', ') || 'none'}`);
  if (skippedPrimarySources.length) console.log(`Discovery sources skipped (unconfigured): ${skippedPrimarySources.map((source) => source.name).join(', ')}`);
  const settled = await Promise.allSettled(activePrimarySources.map(async (source) => ({ source, candidates: await source.search(query) })));
  const candidates: RawCandidate[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      console.log(`Discovery source ${result.value.source.name} returned ${result.value.candidates.length} candidates.`);
      candidates.push(...result.value.candidates.map((candidate) => ({ ...candidate, source: candidate.source || result.value.source.name })));
    } else {
      console.warn(`Discovery source failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  }

  if (playwrightSource && (options.forcePlaywright || candidates.length === 0)) {
    console.log(`Discovery source ${playwrightSource.name} running as ${options.forcePlaywright ? 'forced corroboration' : 'fallback'}.`);
    try {
      const playwrightCandidates = await playwrightSource.search(query);
      console.log(`Discovery source ${playwrightSource.name} returned ${playwrightCandidates.length} candidates.`);
      candidates.push(...playwrightCandidates.map((candidate) => ({ ...candidate, source: candidate.source || playwrightSource.name })));
    } catch (error: any) {
      console.warn(`Discovery source ${playwrightSource.name} failed: ${error.message || error}`);
    }
  } else if (playwrightSource) {
    console.log(`Discovery source ${playwrightSource.name} skipped because higher-priority sources found candidates.`);
  }

  return candidates;
}

export function getDiscoverySources(): readonly DiscoverySource[] {
  return sources;
}
