export interface BusinessQuery {
  name?: string;
  category?: string;
  city?: string;
  pin?: string;
  phone?: string;
  website?: string;
  ownerName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  searchQueries?: string[];
}

export interface RawCandidate {
  source: string;
  name?: string;
  address?: string;
  phone?: string;
  website?: string;
  category?: string;
  ownerName?: string;
  lat?: number;
  lng?: number;
  raw?: unknown;
  searchUrl?: string;
  directoryName?: string;
  domain?: string;
}

export interface DiscoverySource {
  name: string;
  priority: number;
  isConfigured(): boolean;
  search(query: BusinessQuery): Promise<RawCandidate[]>;
}
