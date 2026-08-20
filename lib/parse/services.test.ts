import { describe, expect, it } from 'vitest';
import { matchService } from './services';

describe('matchService', () => {
  const cases: [string, string][] = [
    ['sold GBP to Bright Smile', 'Google Business Profile Optimization'],
    ['started GMB work', 'Google Business Profile Optimization'],
    ['their google profile needs work', 'Google Business Profile Optimization'],
    ['starting the website for them', 'Dental Website Development'],
    ['new site build', 'Dental Website Development'],
    ['whatsapp automation signed', 'WhatsApp Automation'],
    ['reviews campaign started', 'Review Automation'],
    ['recall system for overdue patients', 'Patient Recall System'],
    ['AI receptionist demo went well', 'AI Appointment Booking Receptionist'],
    ['the call bot is ready', 'AI Appointment Booking Receptionist'],
    ['Google Business Profile Optimization signed', 'Google Business Profile Optimization']
  ];

  it.each(cases)('%s -> %s', (text, service) => {
    expect(matchService(text)?.service).toBe(service);
  });

  it('returns null when no service or alias is mentioned', () => {
    expect(matchService('just called to say hi')).toBeNull();
  });
});
