/**
 * Table types for migrations that are written but not yet applied.
 *
 * `types/database.ts` is generated from the live database, so it cannot know
 * about a table until the migration creating it has run — and the client-app
 * migrations are deliberately unapplied (see
 * `docs/features/client-app/build-progress.md` → Applying the migrations).
 * Without this, `apps/client` and the client adapter would not typecheck at
 * all, and the only way to make them typecheck would be to apply a migration
 * to production to unblock a build. That is precisely the wrong incentive.
 *
 * Hand-written, therefore, and narrowly: only the columns the client adapter
 * actually reads and writes. It is not a second source of truth for the schema
 * — `supabase/migrations/` is that — it is a temporary bridge with an explicit
 * end.
 *
 * **Delete this file** once the migrations are applied and
 * `pnpm --filter @platform/db generate-types` has run. `ClientDatabase` then
 * collapses to `Database` and `clientTables.test.ts` fails, which is the
 * reminder.
 */
import type { Database, Json } from './database.js';

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type PendingClientTables = {
  client_accounts: {
    Row: Timestamps & {
      id: string;
      display_name: string;
      client_type: string;
      subscription_status: string;
      subscription_started_at: string | null;
      subscription_renews_at: string | null;
      related_company_id: string | null;
      notes: string | null;
      created_by: string | null;
    };
    Insert: Partial<PendingClientTables['client_accounts']['Row']> & {
      display_name: string;
      client_type: string;
    };
    Update: Partial<PendingClientTables['client_accounts']['Row']>;
    Relationships: [];
  };

  client_users: {
    Row: Timestamps & {
      id: string;
      account_id: string;
      full_name: string;
      email: string;
      role: string;
      status: string;
      last_seen_at: string | null;
    };
    Insert: Partial<PendingClientTables['client_users']['Row']> & {
      id: string;
      account_id: string;
      full_name: string;
      email: string;
    };
    Update: Partial<PendingClientTables['client_users']['Row']>;
    Relationships: [];
  };

  client_disclosures: {
    Row: {
      id: string;
      client_user_id: string;
      document_id: string | null;
      document_version: string;
      acknowledged_at: string;
      ip_address: string | null;
    };
    Insert: {
      id?: string;
      client_user_id: string;
      document_id?: string | null;
      document_version: string;
      acknowledged_at?: string;
      ip_address?: string | null;
    };
    Update: Partial<PendingClientTables['client_disclosures']['Row']>;
    Relationships: [];
  };

  client_invites: {
    Row: {
      id: string;
      account_id: string;
      email: string;
      full_name: string;
      role: string;
      token_hash: string;
      expires_at: string;
      accepted_at: string | null;
      accepted_by: string | null;
      revoked_at: string | null;
      created_by: string | null;
      created_at: string;
    };
    Insert: Partial<PendingClientTables['client_invites']['Row']> & {
      account_id: string;
      email: string;
      full_name: string;
      token_hash: string;
      expires_at: string;
    };
    Update: Partial<PendingClientTables['client_invites']['Row']>;
    Relationships: [];
  };

  compliance_documents: {
    Row: Timestamps & {
      id: string;
      doc_type: string;
      title: string;
      version: string;
      body: string;
      status: string;
      effective_from: string | null;
      notes: string | null;
      created_by: string | null;
    };
    Insert: Partial<PendingClientTables['compliance_documents']['Row']> & {
      doc_type: string;
      title: string;
      version: string;
      body: string;
    };
    Update: Partial<PendingClientTables['compliance_documents']['Row']>;
    Relationships: [];
  };

  company_profile: {
    Row: Timestamps & {
      id: boolean;
      legal_name: string;
      trading_name: string;
      abn: string | null;
      acn: string | null;
      registered_address: string | null;
      registered_state: string | null;
      registered_postcode: string | null;
      public_phone: string | null;
      public_email: string | null;
      public_website: string | null;
      complaints_contact: string | null;
      complaints_email: string | null;
      complaints_phone: string | null;
    };
    Insert: Partial<PendingClientTables['company_profile']['Row']> & {
      legal_name: string;
      trading_name: string;
    };
    Update: Partial<PendingClientTables['company_profile']['Row']>;
    Relationships: [];
  };

  commercial_relationships: {
    Row: Timestamps & {
      id: string;
      entity_type: string;
      entity_id: string;
      relationship_type: string;
      direction: string;
      fee_basis: string;
      fee_amount: number | null;
      disclosure_text: string;
      is_active: boolean;
      started_at: string | null;
      ended_at: string | null;
      related_contract_id: string | null;
      approved_by: string | null;
      notes: string | null;
    };
    Insert: Partial<PendingClientTables['commercial_relationships']['Row']> & {
      entity_type: string;
      entity_id: string;
      relationship_type: string;
      direction: string;
      disclosure_text: string;
    };
    Update: Partial<PendingClientTables['commercial_relationships']['Row']>;
    Relationships: [];
  };

  prepare_templates: {
    Row: Timestamps & {
      id: string;
      slug: string;
      title: string;
      artefact_type: string;
      client_type: string;
      version: string;
      status: string;
      body: string;
      facts_required: string[];
      lex_reviewed_at: string | null;
      lex_reviewed_by: string | null;
      lex_notes: string | null;
      regulatory_references: string[] | null;
      review_due_date: string | null;
      notes: string | null;
      created_by: string | null;
    };
    Insert: Partial<PendingClientTables['prepare_templates']['Row']> & {
      slug: string;
      title: string;
      artefact_type: string;
      client_type: string;
      version: string;
      body: string;
    };
    Update: Partial<PendingClientTables['prepare_templates']['Row']>;
    Relationships: [];
  };

  prepare_generations: {
    Row: {
      id: string;
      account_id: string;
      template_id: string;
      template_version: string;
      artefact_type: string;
      fact_snapshot: Json;
      event: string;
      generated_at: string;
    };
    Insert: {
      id?: string;
      account_id: string;
      template_id: string;
      template_version: string;
      artefact_type: string;
      fact_snapshot?: Json;
      event?: string;
      generated_at?: string;
    };
    Update: Partial<PendingClientTables['prepare_generations']['Row']>;
    Relationships: [];
  };

  client_library_sections: {
    Row: Timestamps & {
      id: string;
      key: string;
      title: string;
      client_type: string;
      sort_order: number;
    };
    Insert: Partial<PendingClientTables['client_library_sections']['Row']> & {
      key: string;
      title: string;
      client_type: string;
    };
    Update: Partial<PendingClientTables['client_library_sections']['Row']>;
    Relationships: [];
  };

  client_library_entries: {
    Row: Timestamps & {
      id: string;
      section_id: string;
      slug: string;
      title: string;
      body: string;
      regulatory_references: string[];
      status: string;
      last_reviewed_at: string | null;
      review_due_date: string | null;
      lex_reviewed_at: string | null;
      lex_reviewed_by: string | null;
      lex_notes: string | null;
      sort_order: number;
      created_by: string | null;
    };
    Insert: Partial<PendingClientTables['client_library_entries']['Row']> & {
      section_id: string;
      slug: string;
      title: string;
      body: string;
    };
    Update: Partial<PendingClientTables['client_library_entries']['Row']>;
    Relationships: [];
  };
};

/**
 * Columns added by the client-app migrations to tables that already exist.
 *
 * Merged onto the generated row types rather than replacing them, so a column
 * added to `products_services` upstream does not get dropped here.
 */
export type PendingColumnAdditions = {
  products_services: {
    is_financial_product: boolean | null;
    product_classification_note: string | null;
    classified_by: string | null;
    classified_at: string | null;
  };
  ecosystem_changes: {
    client_note: string | null;
    client_promoted_by: string | null;
    client_promoted_at: string | null;
  };
  research_companies: {
    client_cleared: boolean;
    client_cleared_by: string | null;
    client_cleared_at: string | null;
  };
  field_source_minimums: {
    /**
     * Implementation facts reach `/register`; outcome facts never do. NULL is
     * unclassified, and unclassified is invisible to subscribers — the safe
     * direction for a key the research pipeline coins later.
     */
    client_fact_class: 'implementation' | 'outcome' | null;
  };
};

/**
 * Functions the client-app migrations create.
 *
 * Both are SECURITY DEFINER with one job each, and both exist so `apps/client`
 * can run on the anon key alone — the alternative was a service-role key in the
 * app, which bypasses RLS and would have made the hardening migration
 * decorative.
 */
export type PendingClientFunctions = {
  redeem_client_invite: {
    Args: { invite_token: string };
    Returns: string;
  };
  client_invite_details: {
    Args: { invite_token: string };
    Returns: Array<{ email: string; full_name: string; account_name: string }>;
  };
  is_team_member: {
    Args: Record<PropertyKey, never>;
    Returns: boolean;
  };
  current_client_account_id: {
    Args: Record<PropertyKey, never>;
    Returns: string | null;
  };
};

type GeneratedTables = Database['public']['Tables'];

type WithAddedColumns = {
  [K in keyof PendingColumnAdditions & keyof GeneratedTables]: Omit<
    GeneratedTables[K],
    'Row' | 'Insert' | 'Update'
  > & {
    Row: GeneratedTables[K]['Row'] & PendingColumnAdditions[K];
    Insert: GeneratedTables[K]['Insert'] & Partial<PendingColumnAdditions[K]>;
    Update: GeneratedTables[K]['Update'] & Partial<PendingColumnAdditions[K]>;
  };
};

/**
 * The database as it will be once the client-app migrations are applied.
 *
 * `apps/client` and the client adapter type against this. `apps/web` and
 * `apps/agents` keep using `Database`, so nothing they do can reach a table
 * that does not exist yet.
 */
export type ClientDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Tables: Omit<GeneratedTables, keyof PendingColumnAdditions> &
      WithAddedColumns &
      PendingClientTables;
    Functions: Database['public']['Functions'] & PendingClientFunctions;
  };
};
