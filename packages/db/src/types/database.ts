export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agent_activity: {
        Row: {
          action: string
          agent_name: string
          approved_actions: Json | null
          approved_at: string | null
          approved_by: string | null
          clarifications: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          notes: string | null
          parent_activity_id: string | null
          proposed_actions: Json | null
          status: string
          trigger_ref: string | null
          trigger_type: string | null
          updated_at: string
          workflow_run_id: string | null
        }
        Insert: {
          action: string
          agent_name: string
          approved_actions?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          clarifications?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          notes?: string | null
          parent_activity_id?: string | null
          proposed_actions?: Json | null
          status?: string
          trigger_ref?: string | null
          trigger_type?: string | null
          updated_at?: string
          workflow_run_id?: string | null
        }
        Update: {
          action?: string
          agent_name?: string
          approved_actions?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          clarifications?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          notes?: string | null
          parent_activity_id?: string | null
          proposed_actions?: Json | null
          status?: string
          trigger_ref?: string | null
          trigger_type?: string | null
          updated_at?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_activity_parent_activity_id_fkey"
            columns: ["parent_activity_id"]
            isOneToOne: false
            referencedRelation: "agent_activity"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          messages: Json | null
          participant_ids: string[] | null
          signal_chat_id: string
          thread_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          messages?: Json | null
          participant_ids?: string[] | null
          signal_chat_id: string
          thread_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          messages?: Json | null
          participant_ids?: string[] | null
          signal_chat_id?: string
          thread_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_assets: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          description: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_gaps: {
        Row: {
          created_at: string
          details: string | null
          directive_summary: string
          director_response: string | null
          gap_type: string
          id: string
          resolved: boolean
          resolved_at: string | null
          suggested_solution: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          directive_summary: string
          director_response?: string | null
          gap_type: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          suggested_solution?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          directive_summary?: string
          director_response?: string | null
          gap_type?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          suggested_solution?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          name: string
          notes: string | null
          size: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name: string
          notes?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          bitcoin_literacy: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string
          linkedin_url: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          pipeline_stage: string
          signal_uuid: string | null
          source: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          bitcoin_literacy?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name: string
          linkedin_url?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pipeline_stage?: string
          signal_uuid?: string | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          bitcoin_literacy?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string
          linkedin_url?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          pipeline_stage?: string
          signal_uuid?: string | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          assigned_to: string | null
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_url: string | null
          scheduled_for: string | null
          source: string | null
          source_interaction_id: string | null
          status: string
          title: string | null
          topic_tags: string[] | null
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_url?: string | null
          scheduled_for?: string | null
          source?: string | null
          source_interaction_id?: string | null
          status?: string
          title?: string | null
          topic_tags?: string[] | null
          type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_url?: string | null
          scheduled_for?: string | null
          source?: string | null
          source_interaction_id?: string | null
          status?: string
          title?: string | null
          topic_tags?: string[] | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_source_interaction_id_fkey"
            columns: ["source_interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_source_interaction_id_fkey"
            columns: ["source_interaction_id"]
            isOneToOne: false
            referencedRelation: "v_recent_interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          contact_id: string | null
          data: Json
          form_id: string
          id: string
          ip_address: string | null
          submitted_at: string
        }
        Insert: {
          contact_id?: string | null
          data?: Json
          form_id: string
          id?: string
          ip_address?: string | null
          submitted_at?: string
        }
        Update: {
          contact_id?: string | null
          data?: Json
          form_id?: string
          id?: string
          ip_address?: string | null
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      fastmail_accounts: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          token: string
          updated_at: string
          username: string
          watched_addresses: string[]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          token: string
          updated_at?: string
          username: string
          watched_addresses?: string[]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          token?: string
          updated_at?: string
          username?: string
          watched_addresses?: string[]
        }
        Relationships: []
      }
      fastmail_exclusions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          type: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          type: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          type?: string
          value?: string
        }
        Relationships: []
      }
      fastmail_sync_state: {
        Row: {
          account_id: string
          id: string
          inbox_query_state: string | null
          jmap_account_id: string | null
          last_synced_at: string | null
          sent_query_state: string | null
        }
        Insert: {
          account_id: string
          id?: string
          inbox_query_state?: string | null
          jmap_account_id?: string | null
          last_synced_at?: string | null
          sent_query_state?: string | null
        }
        Update: {
          account_id?: string
          id?: string
          inbox_query_state?: string | null
          jmap_account_id?: string | null
          last_synced_at?: string | null
          sent_query_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fastmail_sync_state_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "fastmail_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean | null
          name: string
          schema: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          name: string
          schema?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean | null
          name?: string
          schema?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          direction: string | null
          duration_seconds: number | null
          extracted_data: Json | null
          id: string
          occurred_at: string
          participants: string[] | null
          raw_content: string | null
          source: string | null
          summary: string | null
          type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          extracted_data?: Json | null
          id?: string
          occurred_at?: string
          participants?: string[] | null
          raw_content?: string | null
          source?: string | null
          summary?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          duration_seconds?: number | null
          extracted_data?: Json | null
          id?: string
          occurred_at?: string
          participants?: string[] | null
          raw_content?: string | null
          source?: string | null
          summary?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_connections: {
        Row: {
          confidence: number | null
          created_at: string
          created_by_agent: string
          id: string
          reasoning: string | null
          relationship: string
          source_item_id: string
          target_item_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by_agent: string
          id?: string
          reasoning?: string | null
          relationship: string
          source_item_id: string
          target_item_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by_agent?: string
          id?: string
          reasoning?: string | null
          relationship?: string
          source_item_id?: string
          target_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_connections_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_connections_target_item_id_fkey"
            columns: ["target_item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          archived_by: string | null
          bitcoin_relevance: string | null
          created_at: string
          embedding: string | null
          fts: unknown
          id: string
          key_arguments: Json | null
          raw_content: string | null
          source_author: string | null
          source_date: string | null
          source_type: string
          source_url: string | null
          stance: string | null
          stance_reasoning: string | null
          summary: string | null
          title: string
          topic_tags: string[] | null
          updated_at: string
        }
        Insert: {
          archived_by?: string | null
          bitcoin_relevance?: string | null
          created_at?: string
          embedding?: string | null
          fts?: unknown
          id?: string
          key_arguments?: Json | null
          raw_content?: string | null
          source_author?: string | null
          source_date?: string | null
          source_type: string
          source_url?: string | null
          stance?: string | null
          stance_reasoning?: string | null
          summary?: string | null
          title: string
          topic_tags?: string[] | null
          updated_at?: string
        }
        Update: {
          archived_by?: string | null
          bitcoin_relevance?: string | null
          created_at?: string
          embedding?: string | null
          fts?: unknown
          id?: string
          key_arguments?: Json | null
          raw_content?: string | null
          source_author?: string | null
          source_date?: string | null
          source_type?: string
          source_url?: string | null
          stance?: string | null
          stance_reasoning?: string | null
          summary?: string | null
          title?: string
          topic_tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_capabilities: {
        Row: {
          agent_name: string
          capability: string
          created_at: string
          id: string
          notes: string | null
          phase: string | null
          status: string
          tools_required: string[] | null
          updated_at: string
        }
        Insert: {
          agent_name: string
          capability: string
          created_at?: string
          id?: string
          notes?: string | null
          phase?: string | null
          status?: string
          tools_required?: string[] | null
          updated_at?: string
        }
        Update: {
          agent_name?: string
          capability?: string
          created_at?: string
          id?: string
          notes?: string | null
          phase?: string | null
          status?: string
          tools_required?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          created_at: string
          created_by: string | null
          estimated_aum: string | null
          id: string
          market_segment: string
          name: string
          notes: string | null
          objection_bank: string[]
          psychographic_profile: Json | null
          sophistication_level: string
          strategic_constraints: Json | null
          success_signals: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimated_aum?: string | null
          id?: string
          market_segment: string
          name: string
          notes?: string | null
          objection_bank?: string[]
          psychographic_profile?: Json | null
          sophistication_level?: string
          strategic_constraints?: Json | null
          success_signals?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimated_aum?: string | null
          id?: string
          market_segment?: string
          name?: string
          notes?: string | null
          objection_bank?: string[]
          psychographic_profile?: Json | null
          sophistication_level?: string
          strategic_constraints?: Json | null
          success_signals?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          priority: string | null
          related_company_id: string | null
          status: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          priority?: string | null
          related_company_id?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          priority?: string | null
          related_company_id?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_related_company_id_fkey"
            columns: ["related_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          related_contact_id: string | null
          related_task_id: string | null
          remind_at: string
          source: string | null
          status: string
          title: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          related_contact_id?: string | null
          related_task_id?: string | null
          remind_at: string
          source?: string | null
          status?: string
          title: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          related_contact_id?: string | null
          related_task_id?: string | null
          remind_at?: string
          source?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "v_open_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements: {
        Row: {
          acceptance_criteria: Json | null
          approved_by: string | null
          assumptions: string[] | null
          clarification_rounds: Json | null
          constraints: string[] | null
          created_at: string
          created_by_agent: string
          dependencies: Json | null
          description: string | null
          id: string
          out_of_scope: string[] | null
          project_id: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
          user_stories: Json | null
        }
        Insert: {
          acceptance_criteria?: Json | null
          approved_by?: string | null
          assumptions?: string[] | null
          clarification_rounds?: Json | null
          constraints?: string[] | null
          created_at?: string
          created_by_agent?: string
          dependencies?: Json | null
          description?: string | null
          id?: string
          out_of_scope?: string[] | null
          project_id?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
          user_stories?: Json | null
        }
        Update: {
          acceptance_criteria?: Json | null
          approved_by?: string | null
          assumptions?: string[] | null
          clarification_rounds?: Json | null
          constraints?: string[] | null
          created_at?: string
          created_by_agent?: string
          dependencies?: Json | null
          description?: string | null
          id?: string
          out_of_scope?: string[] | null
          project_id?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          user_stories?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "requirements_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_open_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          action_config: Json
          action_type: string
          agent_name: string
          created_at: string
          created_by: string | null
          dashboard_title: string | null
          description: string | null
          frequency: string
          id: string
          is_active: boolean
          last_error: string | null
          last_result: Json | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string
          show_on_dashboard: boolean
          time_of_day: string
          timezone: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          agent_name: string
          created_at?: string
          created_by?: string | null
          dashboard_title?: string | null
          description?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at: string
          show_on_dashboard?: boolean
          time_of_day?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          agent_name?: string
          created_at?: string
          created_by?: string | null
          dashboard_title?: string | null
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_result?: Json | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string
          show_on_dashboard?: boolean
          time_of_day?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_register: {
        Row: {
          created_at: string
          description: string | null
          id: string
          identified_by: string
          likelihood: string
          mitigation: string | null
          project_id: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          identified_by: string
          likelihood: string
          mitigation?: string | null
          project_id?: string | null
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          identified_by?: string
          likelihood?: string
          mitigation?: string | null
          project_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_register_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          parent_task_id: string | null
          priority: string
          project_id: string | null
          related_contact_id: string | null
          reminder_at: string | null
          source: string | null
          source_activity_id: string | null
          source_interaction_id: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          project_id?: string | null
          related_contact_id?: string | null
          reminder_at?: string | null
          source?: string | null
          source_activity_id?: string | null
          source_interaction_id?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          project_id?: string | null
          related_contact_id?: string | null
          reminder_at?: string | null
          source?: string | null
          source_activity_id?: string | null
          source_interaction_id?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "v_open_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_contact_id_fkey"
            columns: ["related_contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_activity_id_fkey"
            columns: ["source_activity_id"]
            isOneToOne: false
            referencedRelation: "agent_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_interaction_id_fkey"
            columns: ["source_interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_interaction_id_fkey"
            columns: ["source_interaction_id"]
            isOneToOne: false
            referencedRelation: "v_recent_interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
          signal_number: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          role?: string
          signal_number?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          signal_number?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_active_capabilities: {
        Row: {
          agent_name: string | null
          capability: string | null
          phase: string | null
          status: string | null
          tools_required: string[] | null
        }
        Insert: {
          agent_name?: string | null
          capability?: string | null
          phase?: string | null
          status?: string | null
          tools_required?: string[] | null
        }
        Update: {
          agent_name?: string | null
          capability?: string | null
          phase?: string | null
          status?: string | null
          tools_required?: string[] | null
        }
        Relationships: []
      }
      v_contacts_overview: {
        Row: {
          bitcoin_literacy: string | null
          company_name: string | null
          full_name: string | null
          id: string | null
          industry: string | null
          job_title: string | null
          open_tasks: number | null
          owner_name: string | null
          pipeline_stage: string | null
          tags: string[] | null
        }
        Relationships: []
      }
      v_open_tasks: {
        Row: {
          assigned_to_name: string | null
          description: string | null
          due_date: string | null
          id: string | null
          parent_task_id: string | null
          priority: string | null
          project_name: string | null
          related_contact_name: string | null
          reminder_at: string | null
          source: string | null
          status: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "v_open_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      v_recent_interactions: {
        Row: {
          company_name: string | null
          contact_name: string | null
          direction: string | null
          duration_seconds: number | null
          extracted_data: Json | null
          id: string | null
          occurred_at: string | null
          participants: string[] | null
          pipeline_stage: string | null
          source: string | null
          summary: string | null
          type: string | null
        }
        Relationships: []
      }
      v_unresolved_capacity_gaps: {
        Row: {
          created_at: string | null
          details: string | null
          directive_summary: string | null
          gap_type: string | null
          id: string | null
          suggested_solution: string | null
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          directive_summary?: string | null
          gap_type?: string | null
          id?: string | null
          suggested_solution?: string | null
        }
        Update: {
          created_at?: string | null
          details?: string | null
          directive_summary?: string | null
          gap_type?: string | null
          id?: string | null
          suggested_solution?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
