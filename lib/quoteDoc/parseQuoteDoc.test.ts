import { describe, expect, it } from 'vitest';
import { parseQuoteDoc } from './parseQuoteDoc';

// No real founder-uploaded quote doc to calibrate against yet — this is a
// representative sample of what a quotation typically looks like once
// extracted to plain text (headers, a scope list with prices, boilerplate
// terms, a signature block). Tune against a real one once it's tried.
const SAMPLE = `
AgastyaOne — Quotation
Prepared for: Banglore Dental Clinic
Date: 20/08/2026

Scope of Work
Dental Website Development - ₹80,000
Google Business Profile Optimization ₹25,000
Local SEO setup, delivered within 2 weeks

Page 1 of 2

Terms and Conditions
This quotation is valid for thirty days from the date of issue and is subject to change without prior written notice.
GST 18% extra
Total: ₹1,05,000

Contact: agastya@agastyaone.com
+91 98765 43210
www.agastyaone.com

Signature
`;

describe('parseQuoteDoc', () => {
  it('extracts scope-of-work lines with their prices, stripped out of the text', () => {
    const { items } = parseQuoteDoc(SAMPLE);
    const website = items.find((i) => i.text.includes('Dental Website Development'));
    expect(website?.price).toBe('₹80,000');
    expect(website?.text).not.toContain('₹');

    const gbp = items.find((i) => i.text.includes('Google Business Profile'));
    expect(gbp?.price).toBe('₹25,000');
  });

  it('detects a relative deadline window', () => {
    const { items } = parseQuoteDoc(SAMPLE);
    const seo = items.find((i) => i.text.includes('Local SEO'));
    expect(seo?.deadline).toBe('within 2 weeks');
  });

  it('drops page furniture, totals, GST lines, contact details and the signature block', () => {
    const { items } = parseQuoteDoc(SAMPLE);
    const texts = items.map((i) => i.text.toLowerCase());
    expect(texts.some((t) => t.startsWith('page'))).toBe(false);
    expect(texts.some((t) => t.includes('gst'))).toBe(false);
    expect(texts.some((t) => t.startsWith('total'))).toBe(false);
    expect(texts.some((t) => t.includes('@'))).toBe(false);
    expect(texts.some((t) => /^\+?\d[\d\s-]{7,}$/.test(t))).toBe(false);
    expect(texts.some((t) => t === 'signature')).toBe(false);
  });

  it('drops the long prose terms sentence but keeps short scope bullets', () => {
    const { items } = parseQuoteDoc(SAMPLE);
    expect(items.some((i) => i.text.includes('valid for thirty days'))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('handles bulleted/numbered lines by stripping the marker', () => {
    const { items } = parseQuoteDoc('- Discovery call\n1. Design mockup\n• Content collected');
    expect(items.map((i) => i.text)).toEqual(['Discovery call', 'Design mockup', 'Content collected']);
  });

  it('returns no items for an empty or whitespace-only document', () => {
    expect(parseQuoteDoc('').items).toEqual([]);
    expect(parseQuoteDoc('   \n\n  ').items).toEqual([]);
  });

  it('caps extraction at 60 items so a malformed extraction cannot flood the review screen', () => {
    const many = Array.from({ length: 200 }, (_, i) => `Line item number ${i}`).join('\n');
    expect(parseQuoteDoc(many).items.length).toBe(60);
  });
});
