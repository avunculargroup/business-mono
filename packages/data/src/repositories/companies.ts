import type { Paginated, ReadContext } from '../context';

/**
 * A company as the list renders it, and as the create form hands one back.
 *
 * `slug` is not decoration: every navigation into a company goes through it
 * (`/crm/companies/[slug]`), so a create that dropped it would produce a row
 * the list cannot link to.
 */
export interface CompanySummary {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  createdAt: string;
}

/** A company's detail page. Same row, read one at a time. */
export interface CompanyDetail {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  notes: string | null;
}

/** A company's contacts, as its detail page lists them. */
export interface CompanyContact {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  pipelineStage: string;
  email: string | null;
}

/** A company as a form picklist shows it. */
export interface CompanyOption {
  id: string;
  name: string;
}

export interface NewCompany {
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  linkedinUrl: string | null;
  notes: string | null;
}

/**
 * A partial edit. Absent keys are left alone, which is not the same as setting
 * them to null — the edit form submits only the fields it rendered.
 */
export type CompanyEdit = Partial<NewCompany>;

export interface CompanyRepository {
  listCompanies(ctx: ReadContext, opts?: { limit?: number }): Promise<Paginated<CompanySummary>>;

  /**
   * By UUID or by slug — the route param is whichever the link used.
   *
   * Which column to match is the adapter's business, not the caller's: a page
   * that had to decide would be a page that knows how rows are addressed, and
   * the fixture adapter would have to reproduce that decision from the outside.
   */
  getCompany(ctx: ReadContext, idOrSlug: string): Promise<CompanyDetail | null>;

  listCompanyContacts(ctx: ReadContext, companyId: string): Promise<CompanyContact[]>;

  /** The picklist several forms share, ordered by name. */
  listCompanyOptions(ctx: ReadContext): Promise<CompanyOption[]>;

  /** Returns the created company, which the form hands straight to its list. */
  createCompany(input: NewCompany): Promise<CompanySummary>;
  updateCompany(id: string, input: CompanyEdit): Promise<void>;
  /** Contacts at the company survive it — the FK is ON DELETE SET NULL. */
  deleteCompany(id: string): Promise<void>;
}
