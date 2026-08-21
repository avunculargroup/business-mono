import type {
  CompanyContact,
  CompanyDetail,
  CompanyOption,
  CompanyRepository,
  CompanySummary,
  Paginated,
  ReadContext,
} from '@platform/data';
import { blocked } from '../blocked';
import { paginate } from '../paginate';
import { companies, companyContacts } from '../fixtures';

export function createCompanyRepository(): CompanyRepository {
  return {
    async listCompanies(
      ctx: ReadContext,
      opts?: { limit?: number },
    ): Promise<Paginated<CompanySummary>> {
      const rows = [...companies(ctx.asOf)].sort((a, b) => a.name.localeCompare(b.name));
      return paginate(rows, opts);
    },

    async getCompany(ctx: ReadContext, idOrSlug: string): Promise<CompanyDetail | null> {
      const row = companies(ctx.asOf).find(
        (company) => company.id === idOrSlug || company.slug === idOrSlug,
      );
      if (!row) return null;

      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        industry: row.industry,
        size: row.size,
        website: row.website,
        notes: row.notes,
      };
    },

    async listCompanyContacts(_ctx: ReadContext, companyId: string): Promise<CompanyContact[]> {
      return companyContacts()[companyId] ?? [];
    },

    async listCompanyOptions(ctx: ReadContext): Promise<CompanyOption[]> {
      return companies(ctx.asOf)
        .map((company) => ({ id: company.id, name: company.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async createCompany(): Promise<CompanySummary> {
      return blocked('createCompany', 'companies');
    },

    async updateCompany(): Promise<void> {
      return blocked('updateCompany', 'companies');
    },

    async deleteCompany(): Promise<void> {
      return blocked('deleteCompany', 'companies');
    },
  };
}
