import type {
  CompanyContact,
  CompanyDetail,
  CompanyEdit,
  CompanyOption,
  CompanyRepository,
  CompanySummary,
  NewCompany,
  Paginated,
  ReadContext,
} from '@platform/data';
import type { SupabaseAdapterContext } from '../adapterContext';

/** The page size the list has always used. */
const LIST_LIMIT = 25;

const SUMMARY_COLUMNS =
  'id, slug, name, industry, size, website, linkedin_url, notes, created_at' as const;

type SummaryRow = {
  id: string;
  slug: string;
  name: string;
  industry: string | null;
  size: string | null;
  website: string | null;
  linkedin_url: string | null;
  notes: string | null;
  created_at: string;
};

function toSummary(row: SummaryRow): CompanySummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    industry: row.industry,
    size: row.size,
    website: row.website,
    linkedinUrl: row.linkedin_url,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/**
 * Which column a route param addresses.
 *
 * A UUID matches `id`, anything else matches `slug`. The app has the same rule
 * in `lib/utils.ts` for the pages this vertical has not reached yet; it lives
 * here because addressing is a property of how rows are stored, and a fixture
 * adapter has to honour it without being able to see the app's helper.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idColumn(value: string): 'id' | 'slug' {
  return UUID.test(value) ? 'id' : 'slug';
}

/** The columns a company write sets, shared by create and update. */
function companyColumns(input: CompanyEdit) {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.industry !== undefined && { industry: input.industry }),
    ...(input.size !== undefined && { size: input.size }),
    ...(input.website !== undefined && { website: input.website }),
    ...(input.linkedinUrl !== undefined && { linkedin_url: input.linkedinUrl }),
    ...(input.notes !== undefined && { notes: input.notes }),
  };
}

export function createCompanyRepository(
  adapter: SupabaseAdapterContext,
): CompanyRepository {
  const { client } = adapter;

  return {
    async listCompanies(
      _ctx: ReadContext,
      opts?: { limit?: number },
    ): Promise<Paginated<CompanySummary>> {
      const limit = opts?.limit ?? LIST_LIMIT;
      const { data, count, error } = await client
        .from('companies')
        .select(SUMMARY_COLUMNS, { count: 'exact' })
        .order('name')
        .limit(limit);

      if (error) throw error;

      const items = (data ?? []).map(toSummary);
      const total = count ?? items.length;
      return { items, total, hasMore: total > items.length };
    },

    async getCompany(_ctx: ReadContext, idOrSlug: string): Promise<CompanyDetail | null> {
      const { data, error } = await client
        .from('companies')
        .select('id, slug, name, industry, size, website, notes')
        .eq(idColumn(idOrSlug), idOrSlug)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        slug: data.slug,
        name: data.name,
        industry: data.industry,
        size: data.size,
        website: data.website,
        notes: data.notes,
      };
    },

    async listCompanyContacts(
      _ctx: ReadContext,
      companyId: string,
    ): Promise<CompanyContact[]> {
      const { data, error } = await client
        .from('contacts')
        .select('id, slug, first_name, last_name, pipeline_stage, email')
        .eq('company_id', companyId)
        .order('first_name');

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        slug: row.slug,
        firstName: row.first_name,
        lastName: row.last_name,
        pipelineStage: row.pipeline_stage,
        email: row.email,
      }));
    },

    async listCompanyOptions(_ctx: ReadContext): Promise<CompanyOption[]> {
      const { data, error } = await client.from('companies').select('id, name').order('name');

      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
    },

    async createCompany(input: NewCompany): Promise<CompanySummary> {
      const { data, error } = await client
        .from('companies')
        .insert({
          ...companyColumns(input),
          name: input.name,
          // Which surface produced the row. The CHECK constraint lists the
          // agents alongside 'web', so this is how a hand-typed company is told
          // apart from one the recorder extracted from a call.
          source: 'web',
        })
        .select(SUMMARY_COLUMNS)
        .single();

      if (error) throw error;
      return toSummary(data);
    },

    async updateCompany(id: string, input: CompanyEdit): Promise<void> {
      const { error } = await client
        .from('companies')
        .update(companyColumns(input))
        .eq('id', id);

      if (error) throw error;
    },

    async deleteCompany(id: string): Promise<void> {
      const { error } = await client.from('companies').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
