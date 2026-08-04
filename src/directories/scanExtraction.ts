import { Page } from 'playwright-core';
import { extractStructuredData } from '../discovery/structuredDataExtractor';
import { ClaimStatus, Completeness } from '../types/nap';
import { RawCandidate } from '../discovery/types';

export interface DirectorySelectors {
  name: string;
  address: string;
  phone: string;
  website?: string;
  category?: string;
  hours?: string;
  photos?: string;
  description?: string;
  attributes?: string;
}

export interface ExtractedDirectoryFields {
  name: string;
  address: string;
  phone: string;
  website: string;
  category: string;
  completeness: Completeness;
  claimStatus: ClaimStatus;
}

// Pages with no real match often still render a name-shaped string: a
// generic app-shell heading ("Google Maps"), a literal "null" from an
// unfilled JSON-LD template, or the site's own "no results" copy. None of
// these are a business name — treat them as absent so the caller correctly
// falls through to NOT_FOUND instead of reporting a fake "found" listing.
const IMPLAUSIBLE_NAME_PATTERNS = [
  /^(null|undefined|n\/a)$/i,
  /^google (maps?|search)$/i,
  /^(sign in|search)$/i,
  /couldn'?t find|no results?( found)?|not found|no matches?|no (clinics?|listings?|businesses?) found/i
];

function isPlausibleName(value: string | undefined | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) return false;
  return !IMPLAUSIBLE_NAME_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function mergeStructuredFields(structured: Partial<RawCandidate> | null, fallback: Pick<ExtractedDirectoryFields, 'name' | 'address' | 'phone' | 'website' | 'category'>): Pick<ExtractedDirectoryFields, 'name' | 'address' | 'phone' | 'website' | 'category'> {
  const structuredName = isPlausibleName(structured?.name) ? structured?.name : undefined;
  const fallbackName = isPlausibleName(fallback.name) ? fallback.name : '';
  return { name: structuredName || fallbackName, address: structured?.address || fallback.address, phone: structured?.phone || fallback.phone, website: structured?.website || fallback.website, category: structured?.category || fallback.category };
}

async function firstText(page: Page, selector?: string): Promise<string> {
  if (!selector) return '';
  return (await page.locator(selector).first().innerText().catch(() => '')).trim();
}

async function hasSelector(page: Page, selector?: string): Promise<boolean | undefined> {
  if (!selector) return undefined;
  return (await page.locator(selector).count()) > 0;
}

function completenessScore(values: Omit<Completeness, 'score'>): Completeness {
  const checks = Object.values(values).filter((value): value is boolean => value !== undefined);
  return { ...values, score: checks.length ? checks.filter(Boolean).length / checks.length : 0 };
}

function claimStatusFromText(text: string): ClaimStatus {
  if (/claim (this|your) (business|listing)|own this business/i.test(text)) return 'UNCLAIMED';
  if(/verified|claimed business|owner verified/i.test(text)) return 'CLAIMED';
  return 'UNKNOWN';
}

export async function extractDirectoryFields(page: Page, url: string, selectors: DirectorySelectors): Promise<ExtractedDirectoryFields> {
  const html = await page.content();
  const structured = await extractStructuredData(html, url);
  const [name, address, phone, website, category, hoursPresent, photosPresent, descriptionPresent, attributesPresent, bodyText] = await Promise.all([
    firstText(page, selectors.name), firstText(page, selectors.address), firstText(page, selectors.phone), firstText(page, selectors.website), firstText(page, selectors.category),
    hasSelector(page, selectors.hours), hasSelector(page, selectors.photos), hasSelector(page, selectors.description), hasSelector(page, selectors.attributes), page.locator('body').innerText().catch(() => '')
  ]);
  return {
    ...mergeStructuredFields(structured, { name, address, phone, website, category }),
    completeness: completenessScore({ hoursPresent, photosPresent, descriptionPresent, attributesPresent }),
    claimStatus: claimStatusFromText(bodyText)
  };
}
