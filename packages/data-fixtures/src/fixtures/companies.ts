import type { CompanyContact, CompanySummary } from '@platform/data';
import { at } from './anchor';
import { COMPANIES, CONTACTS } from './entities';

/**
 * The CRM glance view.
 *
 * A short list, because the demo's CRM surface is a glance rather than a
 * workspace — its job is to show that email, calls and meeting notes land
 * against the right contact without anyone filing them, not to be a convincing
 * pipeline.
 *
 * Notes are the operator's own, and are the most human writing in the fixture
 * set. They are also the place a real CRM would carry things nobody should
 * read, which is why every one of them is about process rather than about a
 * person.
 */
export function companies(anchor: Date): CompanySummary[] {
  return [
    {
      ...COMPANIES.kestrel,
      linkedinUrl: null,
      notes: 'Two people on every call, which is why the second contact matters. Custody is the open question, not the case for holding.',
      createdAt: at(anchor, -68),
    },
    {
      ...COMPANIES.marrowbone,
      linkedinUrl: null,
      // The stalled account. A findings pack would point here — the staging
      // table's row for it — and the note is what a director would actually
      // have written rather than a status label.
      notes: 'Nothing since the scoping call. Not cold, just waiting on their board cycle. Check back after the half-year.',
      createdAt: at(anchor, -104),
    },
    {
      ...COMPANIES.tolquist,
      linkedinUrl: null,
      notes: 'Came in through the education side. No treasury conversation yet and it would be premature to start one.',
      createdAt: at(anchor, -31),
    },
    {
      ...COMPANIES.ardenne,
      linkedinUrl: null,
      notes: null,
      createdAt: at(anchor, -12),
    },
  ];
}

/**
 * Contacts by company id.
 *
 * Two companies have contacts and two do not, so the detail page's empty state
 * is reachable rather than theoretical.
 */
export function companyContacts(): Record<string, CompanyContact[]> {
  const contact = (c: (typeof CONTACTS)[keyof typeof CONTACTS]): CompanyContact => ({
    id: c.id,
    slug: c.slug,
    firstName: c.firstName,
    lastName: c.lastName,
    pipelineStage: c.pipelineStage,
    email: c.email,
  });

  return {
    [COMPANIES.kestrel.id]: [contact(CONTACTS.halloway), contact(CONTACTS.okonkwo)],
    [COMPANIES.marrowbone.id]: [contact(CONTACTS.ferrymead)],
    [COMPANIES.tolquist.id]: [],
    [COMPANIES.ardenne.id]: [],
  };
}
