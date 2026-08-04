import { RawCandidate } from './types';

function decodeHtml(value: string): string {
  return value.replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&').trim();
}

function metaContent(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const pattern = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>|<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["'][^>]*>`, 'i');
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1] || match[2]);
  }
  return undefined;
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  return [object, ...flattenJsonLd(object['@graph'])];
}

function isLocalBusiness(value: Record<string, unknown>): boolean {
  const type = value['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((item) => typeof item === 'string' && /localbusiness|dentist|medicalbusiness|physician|healthandbeautybusiness/i.test(item));
}

function formatAddress(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (!value || typeof value !== 'object') return undefined;
  const address = value as Record<string, unknown>;
  return [address.streetAddress, address.addressLocality, address.addressRegion, address.postalCode, address.addressCountry]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .join(', ') || undefined;
}

function definedValues(candidate: Partial<RawCandidate>): Partial<RawCandidate> {
  return Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined)) as Partial<RawCandidate>;
}

export async function extractStructuredData(html: string, url: string): Promise<Partial<RawCandidate> | null> {
  const scripts = html.matchAll(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const records = flattenJsonLd(JSON.parse(script[1].trim()));
      const localBusiness = records.find(isLocalBusiness);
      if (!localBusiness) continue;
      // `url` is intentionally left undefined rather than falling back to the
      // page's own address (the `url` param) — that's the citation listing
      // page we're scraping, not the business's actual website, and the two
      // must never be conflated in a NAP diff.
      const candidate: Partial<RawCandidate> = {
        name: typeof localBusiness.name === 'string' ? localBusiness.name : undefined,
        address: formatAddress(localBusiness.address),
        phone: typeof localBusiness.telephone === 'string' ? localBusiness.telephone : undefined,
        website: typeof localBusiness.url === 'string' ? localBusiness.url : undefined,
        category: typeof localBusiness['@type'] === 'string' ? localBusiness['@type'] : undefined
      };
      if (candidate.name || candidate.address || candidate.phone || candidate.website) return definedValues(candidate);
    } catch {}
  }

  // og:url is the directory page's own canonical URL, not the business's
  // website — do not use it as a website value for the same reason as above.
  const candidate: Partial<RawCandidate> = {
    name: metaContent(html, ['og:title', 'twitter:title']),
    address: metaContent(html, ['business:contact_data:street_address', 'street-address', 'address', 'geo.placename']),
    phone: metaContent(html, ['business:contact_data:phone_number', 'telephone', 'phone'])
  };
  return candidate.name || candidate.address || candidate.phone ? definedValues(candidate) : null;
}
