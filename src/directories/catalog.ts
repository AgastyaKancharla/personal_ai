/**
 * Human-curated directory strategy. These are recommendations, not a promise
 * that a listing exists or that a provider accepts every business category.
 * The auditStatus tells the UI whether this codebase can check it today.
 */
export type DirectoryAuditStatus = 'supported' | 'planned';

export interface DirectoryCatalogEntry {
  id: string;
  name: string;
  website: string;
  claimUrl?: string;
  categories: string[];
  market: 'India' | 'Global';
  priority: 'core' | 'vertical';
  kind: 'map' | 'directory' | 'marketplace' | 'association';
  access: 'free-claim' | 'free-listing' | 'community-edit' | 'partner-or-paid';
  auditStatus: DirectoryAuditStatus;
  rationale: string;
  verification: string;
}

const CORE: DirectoryCatalogEntry[] = [
  {
    id: 'google_business', name: 'Google Business Profile', website: 'https://www.google.com/business/',
    categories: ['all'], market: 'Global', priority: 'core', auditStatus: 'supported',
    kind: 'map', access: 'free-claim',
    rationale: 'Primary local-search presence for Google Search and Maps.', verification: 'Business ownership verification is required.'
  },
  {
    id: 'bing_places', name: 'Bing Places for Business', website: 'https://www.bingplaces.com/',
    categories: ['all'], market: 'Global', priority: 'core', auditStatus: 'planned',
    kind: 'map', access: 'free-claim',
    rationale: 'Free business listing for Bing search users.', verification: 'Claim or add the listing, then verify by PIN, phone, or email.'
  },
  {
    id: 'apple_business_connect', name: 'Apple Business Connect', website: 'https://businessconnect.apple.com/',
    categories: ['all'], market: 'Global', priority: 'core', auditStatus: 'planned',
    kind: 'map', access: 'free-claim',
    rationale: 'Controls business details shown across Apple Maps, Siri, and related Apple surfaces.', verification: 'Apple Account and business verification are required.'
  },
  {
    id: 'openstreetmap', name: 'OpenStreetMap', website: 'https://www.openstreetmap.org/',
    categories: ['all'], market: 'Global', priority: 'core', auditStatus: 'planned',
    kind: 'map', access: 'community-edit',
    rationale: 'Open geographic data source used by many maps and apps.', verification: 'Edits must follow OpenStreetMap community and on-the-ground rules.'
  },
  {
    id: 'justdial', name: 'Justdial', website: 'https://www.justdial.com/', claimUrl: 'https://www.justdial.com/Free-Listing',
    categories: ['all'], market: 'India', priority: 'core', auditStatus: 'supported',
    kind: 'directory', access: 'free-listing',
    rationale: 'Large India-focused local directory across consumer and service categories.', verification: 'Mobile OTP and business details are required for a free listing.'
  },
  {
    id: 'sulekha', name: 'Sulekha', website: 'https://www.sulekha.com/',
    categories: ['all', 'home_services', 'professional_services'], market: 'India', priority: 'core', auditStatus: 'supported',
    kind: 'directory', access: 'partner-or-paid',
    rationale: 'India-focused local-services discovery platform.', verification: 'Confirm current onboarding and category availability before submission.'
  }
  ,{
    id: 'mappls', name: 'Mappls', website: 'https://about.mappls.com/app/features/add-place/',
    categories: ['all'], market: 'India', priority: 'core', auditStatus: 'planned',
    kind: 'map', access: 'community-edit',
    rationale: 'India-focused map presence; add or correct a place only with accurate, on-the-ground information.', verification: 'Follow Mappls place-submission and verification rules.'
  }
];

const VERTICALS: DirectoryCatalogEntry[] = [
  {
    id: 'practo', name: 'Practo', website: 'https://www.practo.com/providers/',
    categories: ['healthcare', 'dental', 'clinic', 'hospital'], market: 'India', priority: 'vertical', auditStatus: 'supported',
    kind: 'directory', access: 'free-listing',
    rationale: 'Patient discovery and appointment platform for verified providers and clinics.', verification: 'OTP plus practitioner/clinic verification documents may be required.'
  },
  {
    id: 'lybrate', name: 'Lybrate', website: 'https://www.lybrate.com/',
    categories: ['healthcare', 'dental', 'clinic', 'hospital'], market: 'India', priority: 'vertical', auditStatus: 'supported',
    kind: 'directory', access: 'free-listing',
    rationale: 'Healthcare discovery platform; use only for eligible, verified practitioners.', verification: 'Confirm provider eligibility and ownership process before listing.'
  },
  {
    id: 'indiamart', name: 'IndiaMART', website: 'https://www.indiamart.com/',
    categories: ['b2b', 'manufacturing', 'industrial', 'elevator', 'supplier'], market: 'India', priority: 'vertical', auditStatus: 'planned',
    kind: 'marketplace', access: 'free-listing',
    rationale: 'B2B supplier marketplace suited to manufacturers, distributors, and industrial services.', verification: 'Seller registration and business contact verification are required.'
  },
  {
    id: 'tradeindia', name: 'TradeIndia', website: 'https://www.tradeindia.com/',
    categories: ['b2b', 'manufacturing', 'industrial', 'elevator', 'supplier'], market: 'India', priority: 'vertical', auditStatus: 'planned',
    kind: 'marketplace', access: 'free-listing',
    rationale: 'B2B marketplace for Indian suppliers and manufacturers.', verification: 'Confirm current seller onboarding and category fit before submission.'
  },
  {
    id: 'exportersindia', name: 'ExportersIndia', website: 'https://www.exportersindia.com/',
    categories: ['b2b', 'manufacturing', 'industrial', 'exporter', 'supplier'], market: 'India', priority: 'vertical', auditStatus: 'planned',
    kind: 'marketplace', access: 'free-listing',
    rationale: 'B2B directory for suppliers, exporters, and manufacturers.', verification: 'Confirm current seller onboarding and category fit before submission.'
  },
  {
    id: 'zomato', name: 'Zomato', website: 'https://www.zomato.com/',
    categories: ['restaurant', 'cafe', 'food'], market: 'India', priority: 'vertical', auditStatus: 'planned',
    kind: 'marketplace', access: 'partner-or-paid',
    rationale: 'Consumer discovery channel for eligible food and beverage businesses.', verification: 'Restaurant-partner onboarding and category eligibility apply.'
  },
  {
    id: 'tripadvisor', name: 'Tripadvisor', website: 'https://www.tripadvisor.in/',
    categories: ['hotel', 'restaurant', 'travel', 'attraction'], market: 'Global', priority: 'vertical', auditStatus: 'planned',
    kind: 'directory', access: 'free-claim',
    rationale: 'Travel discovery and review platform for eligible venues.', verification: 'Claim or create only the legitimate venue profile.'
  }
  ,{
    id: 'dial4trade', name: 'Dial4Trade', website: 'https://www.dial4trade.com/',
    categories: ['b2b', 'manufacturing', 'industrial', 'elevator', 'supplier'], market: 'India', priority: 'vertical', auditStatus: 'planned',
    kind: 'marketplace', access: 'free-listing',
    rationale: 'B2B supplier directory; use only when the company has a genuine product or service catalogue.', verification: 'Confirm the current free-listing terms and verify ownership before submission.'
  }
];

function normalizedCategory(category: string): string[] {
  const value = category.toLowerCase();
  const matches: string[] = [];
  if (/doctor|dental|dentist|clinic|hospital|health|medical/.test(value)) matches.push('healthcare', 'dental', 'clinic', 'hospital');
  if (/elevator|lift|manufactur|industrial|supplier|b2b|fabricat|equipment|machine/.test(value)) matches.push('b2b', 'manufacturing', 'industrial', 'elevator', 'supplier');
  if (/restaurant|cafe|food|bakery|hotel|travel|tourism/.test(value)) matches.push('restaurant', 'cafe', 'food', 'hotel', 'travel');
  if (/plumb|electric|repair|clean|interior|contractor|home/.test(value)) matches.push('home_services');
  if (/legal|account|consult|agency|professional/.test(value)) matches.push('professional_services');
  return matches;
}

export function getDirectoryCatalog(category = ''): DirectoryCatalogEntry[] {
  const tags = normalizedCategory(category);
  const relevantVerticals = VERTICALS.filter((entry) => entry.categories.some((tag) => tags.includes(tag)));
  return [...CORE, ...relevantVerticals];
}
