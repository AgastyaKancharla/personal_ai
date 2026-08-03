import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  // Self-Hosted Playwright WebSocket endpoint (optional, if running separate Playwright container)
  PLAYWRIGHT_WS_ENDPOINT: process.env.PLAYWRIGHT_WS_ENDPOINT || '',

  // Preferred, supported way to discover Google Business Profiles. When this
  // is absent discovery still uses the browser fallbacks, but those pages can
  // legitimately change or show a consent/challenge screen.
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  GOOGLE_CSE_KEY: process.env.GOOGLE_CSE_KEY || '',
  GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID || '',
  BING_SEARCH_KEY: process.env.BING_SEARCH_KEY || '',

  // Public OSM services are deliberately rate-limited. Set this to false when
  // operating at a volume that requires your own Nominatim/Overpass instance.
  ENABLE_OSM_DISCOVERY: process.env.ENABLE_OSM_DISCOVERY !== 'false',
  OSM_USER_AGENT: process.env.OSM_USER_AGENT || 'NexusSuiteCitationAudit/1.0 (self-hosted business discovery)',

  // Whether running in cloud mode (CDP / Browserless) vs local Chromium
  IS_CLOUD_MODE: !!process.env.PLAYWRIGHT_WS_ENDPOINT,

  // Supabase Cloud DB Config
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  INTERNAL_OPERATOR_NAME: process.env.INTERNAL_OPERATOR_NAME || 'AgastyaOne Internal Operator',
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || '',
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI || '',

  // Worker Settings
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
  HEADLESS: process.env.HEADLESS !== 'false',

  // Gates the dashboard and all /api/* routes behind a login page. Leave unset
  // only for local development; every deployed instance should set this,
  // since approved corrections push real writes to a client's live listings.
  INTERNAL_APP_PASSWORD: process.env.INTERNAL_APP_PASSWORD || '',
  // Signs session cookies. If unset, a random secret is generated per process
  // (sessions reset on every restart/deploy). Set a stable 32+ byte value in
  // production.
  SESSION_SECRET: process.env.SESSION_SECRET || ''
};
