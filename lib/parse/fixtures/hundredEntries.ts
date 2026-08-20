import { Client } from '../../types';
import { mkClient } from '../testHelpers';

/**
 * 100 hand-written entries in the founder's own phrasing, covering the
 * matchers Phase 1 must handle plus deliberate negative/escalation cases
 * (ambiguous clients, no client at all, nonsense). This file is the rules
 * engine's specification — every future change to lib/parse/ should be
 * checked against it, and a real logged entry that breaks something new
 * belongs here as a new case, not just a bug fix.
 *
 * Fixed "today": 2026-08-19, a Wednesday.
 */
export const TODAY = '2026-08-19';

export const CLIENTS: Client[] = [
  mkClient('Bright Smile Dental Clinic', 'cold'),
  mkClient('Smile Dental', 'interested'),
  mkClient('Nissa Dental Clinic', 'meeting'),
  mkClient('Verma Dental', 'finalised'),
  mkClient('Rathi Dental & Implant Center', 'quoted'),
  mkClient('Apex Physio Care', 'building'),
  mkClient('Wellness Skin Clinic', 'delivered'),
  mkClient('Care Dental Studio', 'cold'),
  mkClient('Sharma Clinic', 'cold'),
  mkClient('Sharma Dental', 'cold')
];

export interface ExpectedAction {
  type: string;
  [key: string]: unknown;
}

export interface Fixture {
  input: string;
  expected: ExpectedAction[];
}

const money: Fixture[] = [
  { input: 'Bright Smile Dental Clinic paid 25k advance', expected: [{ type: 'money', clientName: 'Bright Smile Dental Clinic', advance: 25000, quoteValue: null }] },
  { input: 'Smile Dental quoted 1.5L for the whole project', expected: [{ type: 'money', clientName: 'Smile Dental', quoteValue: 150000, advance: null }] },
  { input: 'received 1.5 lakh advance from Nissa Dental Clinic', expected: [{ type: 'money', clientName: 'Nissa Dental Clinic', advance: 150000, quoteValue: null }] },
  { input: 'Verma Dental paid the token amount of 5k', expected: [{ type: 'money', clientName: 'Verma Dental', advance: 5000, quoteValue: null }] },
  { input: 'Rathi Dental & Implant Center gave a quote of ₹80,000', expected: [{ type: 'money', clientName: 'Rathi Dental & Implant Center', quoteValue: 80000, advance: null }] },
  { input: 'Care Dental Studio - 25000 advance paid', expected: [{ type: 'money', clientName: 'Care Dental Studio', advance: 25000, quoteValue: null }] },
  { input: 'quoted Bright Smile Dental Clinic 2cr for the full rebrand', expected: [{ type: 'money', clientName: 'Bright Smile Dental Clinic', quoteValue: 20000000, advance: null }] },
  { input: 'token 10k from Rathi Dental & Implant Center', expected: [{ type: 'money', clientName: 'Rathi Dental & Implant Center', advance: 10000, quoteValue: null }] },
  { input: 'Apex Physio Care quote sent for 60k', expected: [{ type: 'money', clientName: 'Apex Physio Care', quoteValue: 60000, advance: null }] },
  { input: 'Care Dental Studio: 45k quoted for local SEO package', expected: [{ type: 'money', clientName: 'Care Dental Studio', quoteValue: 45000, advance: null }, { type: 'service', clientName: 'Care Dental Studio', service: 'Local SEO' }] },
  { input: 'Smile Dental — 2.5L advance paid', expected: [{ type: 'money', clientName: 'Smile Dental', advance: 250000, quoteValue: null }] },
  { input: '40k advance from an unknown clinic', expected: [] }
];

const datesAndTasks: Fixture[] = [
  { input: 'meeting with Bright Smile Dental Clinic on Friday', expected: [{ type: 'task', clientName: 'Bright Smile Dental Clinic', date: '2026-08-21' }] },
  { input: 'meeting Smile Dental tomorrow', expected: [{ type: 'task', clientName: 'Smile Dental', date: '2026-08-20' }] },
  { input: 'meeting Nissa Dental Clinic day after tomorrow', expected: [{ type: 'task', clientName: 'Nissa Dental Clinic', date: '2026-08-21' }] },
  { input: 'meeting Verma Dental next week', expected: [{ type: 'task', clientName: 'Verma Dental', date: '2026-08-24' }] },
  { input: 'demo for Rathi Dental & Implant Center on Thursday', expected: [{ type: 'task', clientName: 'Rathi Dental & Implant Center', date: '2026-08-20' }] },
  { input: 'meeting Apex Physio Care on the 25th', expected: [{ type: 'task', clientName: 'Apex Physio Care', date: '2026-08-25' }] },
  { input: 'meeting Wellness Skin Clinic on 25/12', expected: [{ type: 'task', clientName: 'Wellness Skin Clinic', date: '2026-12-25' }] },
  { input: 'met Care Dental Studio today', expected: [{ type: 'stage', clientName: 'Care Dental Studio', stage: 'meeting' }] },
  { input: 'visited Sharma Clinic', expected: [{ type: 'stage', clientName: 'Sharma Clinic', stage: 'meeting' }] },
  { input: 'meeting Sharma Dental on Monday', expected: [{ type: 'task', clientName: 'Sharma Dental', date: '2026-08-24' }] },
  { input: 'demo scheduled with Bright Smile Dental Clinic on the 3rd', expected: [{ type: 'task', clientName: 'Bright Smile Dental Clinic', date: '2026-09-03' }] },
  { input: 'meeting Smile Dental on Saturday', expected: [{ type: 'task', clientName: 'Smile Dental', date: '2026-08-22' }] },
  { input: 'call Smile Dental tomorrow', expected: [] },
  { input: 'follow up with Nissa Dental Clinic next week', expected: [] },
  { input: 'meeting scheduled Thursday', expected: [{ type: 'task', clientName: null, date: '2026-08-20' }] }
];

const stageVerbs: Fixture[] = [
  { input: 'called Bright Smile Dental Clinic', expected: [{ type: 'stage', clientName: 'Bright Smile Dental Clinic', stage: 'cold' }] },
  { input: 'cold called Smile Dental this morning', expected: [{ type: 'stage', clientName: 'Smile Dental', stage: 'cold' }] },
  { input: 'rang Nissa Dental Clinic, no answer', expected: [{ type: 'stage', clientName: 'Nissa Dental Clinic', stage: 'cold' }] },
  { input: 'Verma Dental is interested', expected: [{ type: 'stage', clientName: 'Verma Dental', stage: 'interested' }] },
  { input: 'Rathi Dental & Implant Center seems keen', expected: [{ type: 'stage', clientName: 'Rathi Dental & Implant Center', stage: 'interested' }] },
  { input: 'Apex Physio Care wants to move ahead', expected: [{ type: 'stage', clientName: 'Apex Physio Care', stage: 'interested' }] },
  { input: 'Wellness Skin Clinic confirmed the deal', expected: [{ type: 'stage', clientName: 'Wellness Skin Clinic', stage: 'finalised' }] },
  { input: 'Care Dental Studio finalised everything', expected: [{ type: 'stage', clientName: 'Care Dental Studio', stage: 'finalised' }] },
  { input: 'Sharma Clinic locked it in', expected: [{ type: 'stage', clientName: 'Sharma Clinic', stage: 'finalised' }] },
  { input: 'Sharma Dental agreed to proceed', expected: [{ type: 'stage', clientName: 'Sharma Dental', stage: 'finalised' }] },
  { input: 'quote sent to Bright Smile Dental Clinic', expected: [{ type: 'stage', clientName: 'Bright Smile Dental Clinic', stage: 'quoted' }] },
  { input: 'sent the quote to Smile Dental', expected: [{ type: 'stage', clientName: 'Smile Dental', stage: 'quoted' }] },
  { input: 'started work for Verma Dental', expected: [{ type: 'stage', clientName: 'Verma Dental', stage: 'building' }] },
  { input: 'building the website for Rathi Dental & Implant Center', expected: [
    { type: 'service', clientName: 'Rathi Dental & Implant Center', service: 'Dental Website Development' },
    { type: 'stage', clientName: 'Rathi Dental & Implant Center', stage: 'building' }
  ] },
  { input: 'Apex Physio Care project is in progress', expected: [{ type: 'stage', clientName: 'Apex Physio Care', stage: 'building' }] },
  { input: 'delivered the project to Wellness Skin Clinic', expected: [{ type: 'stage', clientName: 'Wellness Skin Clinic', stage: 'delivered' }] },
  { input: 'handed over everything to Care Dental Studio', expected: [{ type: 'stage', clientName: 'Care Dental Studio', stage: 'delivered' }] },
  { input: 'Sharma Dental site is live', expected: [{ type: 'done', clientName: 'Sharma Dental', match: 'site' }] }
];

const services: Fixture[] = [
  { input: 'sold GBP to Bright Smile Dental Clinic', expected: [{ type: 'service', clientName: 'Bright Smile Dental Clinic', service: 'Google Business Profile Optimization' }] },
  { input: 'started GMB work for Smile Dental', expected: [
    { type: 'service', clientName: 'Smile Dental', service: 'Google Business Profile Optimization' },
    { type: 'stage', clientName: 'Smile Dental', stage: 'building' }
  ] },
  { input: "Nissa Dental Clinic's google profile needs work", expected: [{ type: 'service', clientName: 'Nissa Dental Clinic', service: 'Google Business Profile Optimization' }] },
  { input: 'starting the website for Verma Dental', expected: [{ type: 'service', clientName: 'Verma Dental', service: 'Dental Website Development' }] },
  { input: 'new site build for Rathi Dental & Implant Center', expected: [{ type: 'service', clientName: 'Rathi Dental & Implant Center', service: 'Dental Website Development' }] },
  { input: 'whatsapp automation signed for Apex Physio Care', expected: [{ type: 'service', clientName: 'Apex Physio Care', service: 'WhatsApp Automation' }] },
  { input: 'reviews campaign started for Wellness Skin Clinic', expected: [
    { type: 'service', clientName: 'Wellness Skin Clinic', service: 'Review Automation' },
    { type: 'stage', clientName: 'Wellness Skin Clinic', stage: 'building' }
  ] },
  { input: 'recall system for Care Dental Studio', expected: [{ type: 'service', clientName: 'Care Dental Studio', service: 'Patient Recall System' }] },
  { input: 'AI receptionist demo went well for Sharma Clinic', expected: [
    { type: 'service', clientName: 'Sharma Clinic', service: 'AI Appointment Booking Receptionist' },
    { type: 'stage', clientName: 'Sharma Clinic', stage: 'meeting' }
  ] },
  { input: 'the call bot is ready for Sharma Dental', expected: [{ type: 'service', clientName: 'Sharma Dental', service: 'AI Appointment Booking Receptionist' }] },
  { input: 'Bright Smile Dental Clinic signed Local SEO', expected: [{ type: 'service', clientName: 'Bright Smile Dental Clinic', service: 'Local SEO' }] },
  { input: 'Smile Dental wants Online Booking System', expected: [
    { type: 'service', clientName: 'Smile Dental', service: 'Online Booking System' },
    { type: 'stage', clientName: 'Smile Dental', stage: 'interested' }
  ] },
  { input: 'Nissa Dental Clinic signed Patient CRM', expected: [{ type: 'service', clientName: 'Nissa Dental Clinic', service: 'Patient CRM' }] },
  { input: 'Verma Dental starting Hosting & Maintenance', expected: [{ type: 'service', clientName: 'Verma Dental', service: 'Hosting & Maintenance' }] },
  { input: 'just checking in, nothing new', expected: [] }
];

const clientResolution: Fixture[] = [
  { input: 'bright smile paid 20k advance', expected: [{ type: 'money', clientName: 'Bright Smile Dental Clinic', advance: 20000, quoteValue: null }] },
  { input: 'rathi implant center confirmed', expected: [{ type: 'stage', clientName: 'Rathi Dental & Implant Center', stage: 'finalised' }] },
  { input: 'wellness skin clinic delivered', expected: [{ type: 'stage', clientName: 'Wellness Skin Clinic', stage: 'delivered' }] },
  { input: 'sharma paid 10k advance', expected: [] },
  // Ambiguous client + two stacked stage verbs — the confidence formula must
  // not let two verb bonuses (0.3 each) cross the 0.6 threshold when the
  // client itself never resolved.
  { input: 'sharma called then confirmed', expected: [] },
  { input: 'sharma clinic paid 10k advance', expected: [{ type: 'money', clientName: 'Sharma Clinic', advance: 10000, quoteValue: null }] },
  { input: 'sharma dental paid 10k advance', expected: [{ type: 'money', clientName: 'Sharma Dental', advance: 10000, quoteValue: null }] },
  { input: 'the care package arrived today', expected: [] },
  { input: 'apex physio care confirmed the project', expected: [{ type: 'stage', clientName: 'Apex Physio Care', stage: 'finalised' }] },
  { input: 'nissa clinic is interested', expected: [{ type: 'stage', clientName: 'Nissa Dental Clinic', stage: 'interested' }] },
  { input: 'random clinic not in our system called', expected: [] }
];

const completions: Fixture[] = [
  { input: 'logo done for Bright Smile Dental Clinic', expected: [{ type: 'done', clientName: 'Bright Smile Dental Clinic', match: 'logo' }] },
  { input: 'finished the website for Smile Dental', expected: [{ type: 'done', clientName: 'Smile Dental', match: 'website' }] },
  { input: 'Nissa Dental Clinic website is live', expected: [{ type: 'done', clientName: 'Nissa Dental Clinic', match: 'website' }] },
  { input: 'finished the brand kit', expected: [{ type: 'tick', match: 'brand kit' }] },
  { input: 'onboarding form is live', expected: [{ type: 'tick', match: 'onboarding form' }] },
  { input: 'homepage copy done for Verma Dental', expected: [{ type: 'done', clientName: 'Verma Dental', match: 'homepage copy' }] },
  { input: 'finished the WhatsApp templates', expected: [{ type: 'tick', match: 'WhatsApp templates' }] },
  { input: 'booking widget done for Rathi Dental & Implant Center', expected: [{ type: 'done', clientName: 'Rathi Dental & Implant Center', match: 'booking widget' }] },
  { input: 'GBP audit done for Apex Physio Care', expected: [{ type: 'done', clientName: 'Apex Physio Care', match: 'GBP audit' }] },
  { input: 'finished the review templates', expected: [{ type: 'tick', match: 'review templates' }] }
];

const multiAction: Fixture[] = [
  { input: 'called Smile Dental, interested, meeting Thursday', expected: [
    { type: 'stage', clientName: 'Smile Dental', stage: 'cold' },
    { type: 'stage', clientName: 'Smile Dental', stage: 'interested' },
    { type: 'task', clientName: 'Smile Dental', date: '2026-08-20' }
  ] },
  { input: 'called Bright Smile Dental Clinic, they are interested', expected: [
    { type: 'stage', clientName: 'Bright Smile Dental Clinic', stage: 'cold' },
    { type: 'stage', clientName: 'Bright Smile Dental Clinic', stage: 'interested' }
  ] },
  { input: 'Nissa Dental Clinic paid 20k advance, quote sent earlier was 1.5L', expected: [
    { type: 'money', clientName: 'Nissa Dental Clinic', advance: 20000, quoteValue: null },
    { type: 'stage', clientName: 'Nissa Dental Clinic', stage: 'quoted' }
  ] },
  { input: 'demo for Verma Dental on Friday, they seem keen', expected: [
    { type: 'task', clientName: 'Verma Dental', date: '2026-08-21' },
    { type: 'stage', clientName: 'Verma Dental', stage: 'interested' }
  ] },
  { input: 'Rathi Dental & Implant Center confirmed and paid 50k advance', expected: [
    { type: 'money', clientName: 'Rathi Dental & Implant Center', advance: 50000, quoteValue: null },
    { type: 'stage', clientName: 'Rathi Dental & Implant Center', stage: 'finalised' }
  ] },
  { input: 'Apex Physio Care signed WhatsApp Automation and paid 15k advance', expected: [
    { type: 'money', clientName: 'Apex Physio Care', advance: 15000, quoteValue: null },
    { type: 'service', clientName: 'Apex Physio Care', service: 'WhatsApp Automation' }
  ] },
  { input: 'Wellness Skin Clinic delivered, invoice done for Wellness Skin Clinic', expected: [
    { type: 'done', clientName: 'Wellness Skin Clinic', match: 'delivered, invoice' }
  ] },
  { input: 'Care Dental Studio interested, quote sent for 40k', expected: [
    { type: 'money', clientName: 'Care Dental Studio', quoteValue: 40000, advance: null },
    { type: 'stage', clientName: 'Care Dental Studio', stage: 'interested' }
  ] },
  { input: 'Sharma Clinic locked it in, advance 25k received', expected: [
    { type: 'money', clientName: 'Sharma Clinic', advance: 25000, quoteValue: null },
    { type: 'stage', clientName: 'Sharma Clinic', stage: 'finalised' }
  ] },
  { input: 'Sharma Dental met us and confirmed', expected: [
    { type: 'stage', clientName: 'Sharma Dental', stage: 'meeting' },
    { type: 'stage', clientName: 'Sharma Dental', stage: 'finalised' }
  ] }
];

const nonsenseAndNegative: Fixture[] = [
  { input: 'asdkj qwoeiu random text about nothing at all', expected: [] },
  { input: 'had lunch, back in office now', expected: [] },
  { input: 'reminder to buy printer paper', expected: [] },
  { input: 'gym at 6am tomorrow', expected: [] },
  { input: 'team standup notes: nothing blocking', expected: [] },
  { input: 'need to renew the domain next month', expected: [] },
  // Real logged failure (parse_log, 2026-08-20): the founder typed just
  // this, expecting to name clients afterward — with no names given at
  // all, there's nothing to create, and it should stay a clean miss.
  { input: 'Three clients', expected: [] }
];

// Real logged failures (parse_log, 2026-08-20): the founder tried to
// declare several brand-new clients in one line and nothing fired, because
// resolveClient() only ever resolves against the *existing* roster. These
// cover matchNewClients() instead — one already-known name in the list
// (Nissa Dental Clinic) should be skipped, only the new ones created.
const newClients: Fixture[] = [
  { input: 'Three clients Nissa Dental Clinic, Banglore Dental and Toothcraft', expected: [
    { type: 'client', name: 'Banglore Dental' },
    { type: 'client', name: 'Toothcraft' }
  ] },
  { input: 'other two clients are Banglore Dental and Toothcraft', expected: [
    { type: 'client', name: 'Banglore Dental' },
    { type: 'client', name: 'Toothcraft' }
  ] }
];

export const HUNDRED_ENTRIES: Fixture[] = [
  ...money,
  ...datesAndTasks,
  ...stageVerbs,
  ...services,
  ...clientResolution,
  ...completions,
  ...newClients,
  ...multiAction,
  ...nonsenseAndNegative
];
