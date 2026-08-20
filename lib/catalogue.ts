import { StageKey } from './types';

export const STAGES: { key: StageKey; label: string; short: string }[] = [
  { key: 'cold', label: 'Cold call', short: 'Cold' },
  { key: 'interested', label: 'Interested', short: 'Intr' },
  { key: 'meeting', label: 'Meeting', short: 'Meet' },
  { key: 'finalised', label: 'Finalised', short: 'Fin' },
  { key: 'quoted', label: 'Quote sent', short: 'Quote' },
  { key: 'advance', label: 'Advance in', short: 'Adv' },
  { key: 'building', label: 'Building', short: 'Build' },
  { key: 'delivered', label: 'Delivered', short: 'Done' }
];

export const stageIndex = (k: string) => Math.max(0, STAGES.findIndex((s) => s.key === k));

export interface ServiceDef {
  code: string;
  name: string;
  steps: string[];
}

export interface CataloguePillar {
  pillar: string;
  items: ServiceDef[];
}

export const CATALOGUE: CataloguePillar[] = [
  {
    pillar: 'Patient Growth',
    items: [
      { code: '01', name: 'Dental Website Development', steps: ['Discovery + requirements locked', 'Content and brand assets collected', 'Design mockup approved', 'Pages built', 'Forms, click-to-call, WhatsApp integrated', 'SSL, sitemap, schema, Core Web Vitals', 'Analytics + Search Console connected', 'QA and client review', 'Deployed and live', 'Admin access + training handover'] },
      { code: '02', name: 'Google Business Profile Optimization', steps: ['Profile audit done', 'Categories and services set', 'Business info and hours corrected', 'Photos uploaded', 'Verification completed', 'Google Posts schedule running', 'Q&A seeded', 'Review response process live', 'Audit summary shared'] },
      { code: '03', name: 'Local SEO', steps: ['Keyword research', 'On-page optimisation', 'Local landing pages built', 'Citations managed', 'Schema implemented', 'Baseline report shared', 'Month 1 performance report'] },
      { code: '04', name: 'AI Visibility (AEO)', steps: ['Schema optimisation', 'Entity optimisation', 'Structured FAQs published', 'Content optimised for answer engines', 'Knowledge graph alignment', 'AI visibility monitoring set up'] },
      { code: '05', name: 'Directory Listing Management', steps: ['Directory audit run', 'NAP standardised', 'Listings created or claimed', 'Duplicate listings suppressed', 'Categories optimised', 'Photos and media updated', 'Verification completed where possible', 'Consistency checklist + report shared'] }
    ]
  },
  {
    pillar: 'Patient Conversion',
    items: [
      { code: '06', name: 'Online Booking System', steps: ['Schedules, doctors and services collected', 'System configured and branded', 'Slots, hours and blackout dates set', 'Confirmation flow tested', 'Live on website and Google profile', 'Documentation + staff training'] },
      { code: '07', name: 'Booking & Appointment Automation', steps: ['Workflows mapped and approved', 'Message templates created', 'Reminder sequence configured', 'Cancellation and reschedule flows built', 'Missed-appointment handling set', 'End-to-end testing', 'Go-live + staff training'] },
      { code: '10', name: 'AI Appointment Booking Receptionist', steps: ['Discovery + call flow design', 'Knowledge base built from FAQs and policies', 'AI conversation configured', 'Telephony integrated', 'Calendar and CRM synced', 'Escalation and human handoff rules set', 'Pilot run completed', 'Go-live + staff training'] }
    ]
  },
  {
    pillar: 'Patient Retention',
    items: [
      { code: '11', name: 'Review Automation', steps: ['Workflow designed', 'Templates approved', 'Review links configured', 'WhatsApp / SMS / email channel connected', 'Testing completed', 'Go-live + reporting set up'] },
      { code: '12', name: 'Patient Recall System', steps: ['Recall policy and intervals defined', 'Patient segmentation configured', 'Recall workflows built', 'Templates approved', 'Overdue patient tracking live', 'Launched + campaign reporting'] }
    ]
  },
  {
    pillar: 'Practice Automation',
    items: [
      { code: '08', name: 'Patient CRM', steps: ['Requirements and pipeline stages defined', 'Patient data imported', 'Fields and workflows configured', 'Booking and WhatsApp integrations', 'User roles and access set', 'Testing completed', 'Training + handover'] },
      { code: '09', name: 'WhatsApp Automation', steps: ['WhatsApp Business API approved', 'Templates written and submitted', 'Trigger rules configured', 'Booking / CRM integration', 'Delivery testing', 'Go-live + training'] }
    ]
  },
  {
    pillar: 'Infrastructure & Reporting',
    items: [
      { code: '13', name: 'Hosting & Maintenance', steps: ['Hosting environment configured', 'Migration completed', 'DNS updated', 'SSL installed', 'Backups scheduled', 'Uptime monitoring live', 'Maintenance schedule documented'] },
      { code: '14', name: 'Unified Reporting Dashboard', steps: ['KPIs defined and approved', 'Data sources connected', 'Dashboard designed', 'Role-based access set', 'Data validated', 'Training + documentation'] }
    ]
  }
];

export const SERVICES: ServiceDef[] = CATALOGUE.flatMap((g) => g.items);

export const findService = (name: string | null | undefined): ServiceDef | null => {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  return (
    SERVICES.find((s) => s.name.toLowerCase() === n) ||
    SERVICES.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase())) ||
    null
  );
};
