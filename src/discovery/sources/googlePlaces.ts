import { CONFIG } from '../../config/env';
import { BusinessQuery, DiscoverySource, RawCandidate } from '../types';

export class GooglePlacesSource implements DiscoverySource {
  readonly name = 'google_places';
  readonly priority = 10;

  isConfigured(): boolean {
    return Boolean(CONFIG.GOOGLE_MAPS_API_KEY);
  }

  async search(query: BusinessQuery): Promise<RawCandidate[]> {
    const candidates: RawCandidate[] = [];
    const seenPlaceIds = new Set<string>();
    const searchQueries = query.searchQueries || [query.name, query.phone, query.website].filter(Boolean) as string[];

    for (const searchQuery of searchQueries) {
      try {
        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': CONFIG.GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.nationalPhoneNumber,places.websiteUri'
          },
          body: JSON.stringify({ textQuery: searchQuery, languageCode: 'en' }),
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string; googleMapsUri?: string; nationalPhoneNumber?: string; websiteUri?: string }> };
        for (const place of payload.places || []) {
          const name = place.displayName?.text?.trim() || '';
          if (!place.id || !name || seenPlaceIds.has(place.id)) continue;
          candidates.push({
            source: this.name,
            name,
            address: place.formattedAddress || '',
            searchUrl: place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(place.id)}`,
            directoryName: 'Google Business Profile',
            domain: 'google.com/maps',
            phone: place.nationalPhoneNumber || '',
            website: place.websiteUri || '',
            raw: place
          });
          seenPlaceIds.add(place.id);
        }
      } catch (error: any) {
        console.warn(`Places API search failed for "${searchQuery}": ${error.message || error}`);
      }
    }
    return candidates;
  }
}
