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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_feedback_guidelines: {
        Row: {
          guidelines: Json
          social_account_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          guidelines?: Json
          social_account_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          guidelines?: Json
          social_account_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_feedback_guidelines_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_feedback_guidelines_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["account_id"]
          },
        ]
      }
      advisor_partner_contacts: {
        Row: {
          advisor_partner_id: string
          contact_id: string
          created_at: string
          id: string
          role: string | null
        }
        Insert: {
          advisor_partner_id: string
          contact_id: string
          created_at?: string
          id?: string
          role?: string | null
        }
        Update: {
          advisor_partner_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advisor_partner_contacts_advisor_partner_id_fkey"
            columns: ["advisor_partner_id"]
            isOneToOne: false
            referencedRelation: "advisors_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisor_partner_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisor_partner_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      advisors_partners: {
        Row: {
          active: boolean
          bio: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          engagement_model: string | null
          id: string
          key_relationship_id: string | null
          linkedin_url: string | null
          logo_url: string | null
          name: string
          rate_notes: string | null
          slug: string
          specialization: string | null
          type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          bio?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          engagement_model?: string | null
          id?: string
          key_relationship_id?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          rate_notes?: string | null
          slug?: string
          specialization?: string | null
          type: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          bio?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          engagement_model?: string | null
          id?: string
          key_relationship_id?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          rate_notes?: string | null
          slug?: string
          specialization?: string | null
          type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advisors_partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisors_partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisors_partners_key_relationship_id_fkey"
            columns: ["key_relationship_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
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
          is_processing: boolean
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
          is_processing?: boolean
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
          is_processing?: boolean
          last_message_at?: string | null
          messages?: Json | null
          participant_ids?: string[] | null
          signal_chat_id?: string
          thread_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          alt_text: string | null
          bucket: string
          byte_size: number | null
          created_at: string
          filename: string
          height: number | null
          id: string
          mime_type: string
          org_id: string
          path: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bucket: string
          byte_size?: number | null
          created_at?: string
          filename: string
          height?: number | null
          id?: string
          mime_type: string
          org_id: string
          path: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bucket?: string
          byte_size?: number | null
          created_at?: string
          filename?: string
          height?: number | null
          id?: string
          mime_type?: string
          org_id?: string
          path?: string
          uploaded_by?: string | null
          width?: number | null
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
      brand_voice: {
        Row: {
          bitcoin_capitalisation_rule: string | null
          content_policy: Json
          created_at: string
          id: string
          is_active: boolean
          mission_summary: string | null
          profile: Json
          updated_at: string
          updated_by: string | null
          version: string
        }
        Insert: {
          bitcoin_capitalisation_rule?: string | null
          content_policy?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          mission_summary?: string | null
          profile?: Json
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Update: {
          bitcoin_capitalisation_rule?: string | null
          content_policy?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          mission_summary?: string | null
          profile?: Json
          updated_at?: string
          updated_by?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_voice_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_accounts: {
        Row: {
          campaign_id: string
          social_account_id: string
        }
        Insert: {
          campaign_id: string
          social_account_id: string
        }
        Update: {
          campaign_id?: string
          social_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_accounts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_accounts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_accounts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_accounts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["account_id"]
          },
        ]
      }
      campaign_beats: {
        Row: {
          campaign_id: string
          core_message: string
          created_at: string
          id: string
          prefer_thread: boolean
          rationale: string | null
          sequence: number
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          campaign_id: string
          core_message: string
          created_at?: string
          id?: string
          prefer_thread?: boolean
          rationale?: string | null
          sequence: number
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          core_message?: string
          created_at?: string
          id?: string
          prefer_thread?: boolean
          rationale?: string | null
          sequence?: number
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_beats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_beats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          audience_persona: string | null
          created_at: string
          created_by: string | null
          duration_weeks: number | null
          gate_state: Json | null
          id: string
          name: string
          objective: string | null
          pending_decision: Json | null
          plan_approved_at: string | null
          plan_approved_by: string | null
          post_slots: Json
          posts_per_week: number | null
          schedule_plan: Json | null
          slug: string
          start_date: string | null
          status: string
          strategy: Json
          strategy_approved_at: string | null
          strategy_approved_by: string | null
          timezone: string
          updated_at: string
          workflow_run_id: string | null
        }
        Insert: {
          audience_filter?: Json
          audience_persona?: string | null
          created_at?: string
          created_by?: string | null
          duration_weeks?: number | null
          gate_state?: Json | null
          id?: string
          name: string
          objective?: string | null
          pending_decision?: Json | null
          plan_approved_at?: string | null
          plan_approved_by?: string | null
          post_slots?: Json
          posts_per_week?: number | null
          schedule_plan?: Json | null
          slug?: string
          start_date?: string | null
          status?: string
          strategy?: Json
          strategy_approved_at?: string | null
          strategy_approved_by?: string | null
          timezone?: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Update: {
          audience_filter?: Json
          audience_persona?: string | null
          created_at?: string
          created_by?: string | null
          duration_weeks?: number | null
          gate_state?: Json | null
          id?: string
          name?: string
          objective?: string | null
          pending_decision?: Json | null
          plan_approved_at?: string | null
          plan_approved_by?: string | null
          post_slots?: Json
          posts_per_week?: number | null
          schedule_plan?: Json | null
          slug?: string
          start_date?: string | null
          status?: string
          strategy?: Json
          strategy_approved_at?: string | null
          strategy_approved_by?: string | null
          timezone?: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_plan_approved_by_fkey"
            columns: ["plan_approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_strategy_approved_by_fkey"
            columns: ["strategy_approved_by"]
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
      champion_events: {
        Row: {
          champion_id: string
          created_at: string
          details: string | null
          event_date: string
          event_type: string
          id: string
        }
        Insert: {
          champion_id: string
          created_at?: string
          details?: string | null
          event_date?: string
          event_type: string
          id?: string
        }
        Update: {
          champion_id?: string
          created_at?: string
          details?: string | null
          event_date?: string
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "champion_events_champion_id_fkey"
            columns: ["champion_id"]
            isOneToOne: false
            referencedRelation: "champions"
            referencedColumns: ["id"]
          },
        ]
      }
      champions: {
        Row: {
          champion_score: number
          company_id: string | null
          contact_id: string
          created_at: string
          id: string
          last_contacted_at: string | null
          notes: string | null
          role_type: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          champion_score?: number
          company_id?: string | null
          contact_id: string
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          role_type: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Update: {
          champion_score?: number
          company_id?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          role_type?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "champions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "champions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      community_watchlist: {
        Row: {
          activity_level: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          engagement_status: string
          id: string
          industry_tags: string[]
          location: string | null
          membership_size: number | null
          name: string
          notes: string | null
          role_tags: string[]
          start_date: string | null
          timezone: string | null
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          activity_level?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          engagement_status?: string
          id?: string
          industry_tags?: string[]
          location?: string | null
          membership_size?: number | null
          name: string
          notes?: string | null
          role_tags?: string[]
          start_date?: string | null
          timezone?: string | null
          type: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          activity_level?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          engagement_status?: string
          id?: string
          industry_tags?: string[]
          location?: string | null
          membership_size?: number | null
          name?: string
          notes?: string | null
          role_tags?: string[]
          start_date?: string | null
          timezone?: string | null
          type?: string
          updated_at?: string
          url?: string | null
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
          slug: string
          source: string | null
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
          slug?: string
          source?: string | null
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
          slug?: string
          source?: string | null
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
      company_domains: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          provider: string | null
          renewal_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          provider?: string | null
          renewal_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          provider?: string | null
          renewal_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_former_names: {
        Row: {
          company_id: string
          id: string
          name: string
          note: string | null
          used_from: string | null
          used_to: string | null
        }
        Insert: {
          company_id: string
          id?: string
          name: string
          note?: string | null
          used_from?: string | null
          used_to?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          name?: string
          note?: string | null
          used_from?: string | null
          used_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_former_names_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_former_names_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_former_names_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
        ]
      }
      company_listings: {
        Row: {
          company_id: string
          filing_entity: string | null
          id: string
          listed_from: string | null
          listed_to: string | null
          listing_type: string
          note: string | null
          ticker: string
          venue: string
        }
        Insert: {
          company_id: string
          filing_entity?: string | null
          id?: string
          listed_from?: string | null
          listed_to?: string | null
          listing_type: string
          note?: string | null
          ticker: string
          venue: string
        }
        Update: {
          company_id?: string
          filing_entity?: string | null
          id?: string
          listed_from?: string | null
          listed_to?: string | null
          listing_type?: string
          note?: string | null
          ticker?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_listings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_listings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_listings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
        ]
      }
      company_record_types: {
        Row: {
          category: string
          content_type: string
          created_at: string
          is_builtin: boolean
          is_singleton: boolean
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          category: string
          content_type: string
          created_at?: string
          is_builtin?: boolean
          is_singleton?: boolean
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          category?: string
          content_type?: string
          created_at?: string
          is_builtin?: boolean
          is_singleton?: boolean
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      company_records: {
        Row: {
          created_at: string
          created_by: string | null
          display_order: number
          filename: string | null
          id: string
          is_pinned: boolean
          mime_type: string | null
          storage_path: string | null
          type_key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_order?: number
          filename?: string | null
          id?: string
          is_pinned?: boolean
          mime_type?: string | null
          storage_path?: string | null
          type_key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_order?: number
          filename?: string | null
          id?: string
          is_pinned?: boolean
          mime_type?: string | null
          storage_path?: string | null
          type_key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_records_type_key_fkey"
            columns: ["type_key"]
            isOneToOne: false
            referencedRelation: "company_record_types"
            referencedColumns: ["key"]
          },
        ]
      }
      company_subscriptions: {
        Row: {
          account_email: string | null
          business: string
          created_at: string
          expiry: string | null
          id: string
          notes: string | null
          payment_type: string | null
          service_type: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_email?: string | null
          business: string
          created_at?: string
          expiry?: string | null
          id?: string
          notes?: string | null
          payment_type?: string | null
          service_type?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_email?: string | null
          business?: string
          created_at?: string
          expiry?: string | null
          id?: string
          notes?: string | null
          payment_type?: string | null
          service_type?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      compliance_snippets: {
        Row: {
          applies_to: string[]
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key: string
          label: string | null
          updated_at: string
          version: string
        }
        Insert: {
          applies_to?: string[]
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key: string
          label?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          applies_to?: string[]
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_snippets_created_by_fkey"
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
          role: Database["public"]["Enums"]["stakeholder_role"] | null
          signal_uuid: string | null
          slug: string
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
          role?: Database["public"]["Enums"]["stakeholder_role"] | null
          signal_uuid?: string | null
          slug?: string
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
          role?: Database["public"]["Enums"]["stakeholder_role"] | null
          signal_uuid?: string | null
          slug?: string
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
      content_embeddings: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          embedding: string | null
          id: string
          source_id: string
          source_table: string
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          created_at?: string
          embedding?: string | null
          id?: string
          source_id: string
          source_table: string
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string | null
          id?: string
          source_id?: string
          source_table?: string
        }
        Relationships: []
      }
      content_feedback: {
        Row: {
          content_item_id: string | null
          created_at: string
          created_by: string | null
          distilled_at: string | null
          draft_excerpt: string | null
          feedback: string
          id: string
          platform: string
          post_form: string | null
          social_account_id: string
          verdict: string | null
        }
        Insert: {
          content_item_id?: string | null
          created_at?: string
          created_by?: string | null
          distilled_at?: string | null
          draft_excerpt?: string | null
          feedback: string
          id?: string
          platform: string
          post_form?: string | null
          social_account_id: string
          verdict?: string | null
        }
        Update: {
          content_item_id?: string | null
          created_at?: string
          created_by?: string | null
          distilled_at?: string | null
          draft_excerpt?: string | null
          feedback?: string
          id?: string
          platform?: string
          post_form?: string | null
          social_account_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_ready_to_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["account_id"]
          },
        ]
      }
      content_images: {
        Row: {
          alt_text: string | null
          content_item_id: string
          created_at: string
          created_by: string | null
          id: string
          platform_crop: string | null
          sort_order: number
          source: string
          storage_path: string
          thread_segment_id: string | null
        }
        Insert: {
          alt_text?: string | null
          content_item_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          platform_crop?: string | null
          sort_order?: number
          source?: string
          storage_path: string
          thread_segment_id?: string | null
        }
        Update: {
          alt_text?: string | null
          content_item_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          platform_crop?: string | null
          sort_order?: number
          source?: string
          storage_path?: string
          thread_segment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_images_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_images_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_images_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_ready_to_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_images_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_images_thread_segment_id_fkey"
            columns: ["thread_segment_id"]
            isOneToOne: false
            referencedRelation: "thread_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          beat_id: string | null
          body: string | null
          campaign_id: string | null
          char_count: number | null
          compliance_checked_at: string | null
          compliance_classification: string | null
          compliance_overridden_by: string | null
          compliance_rationale: string | null
          compliance_status: string | null
          created_at: string
          created_by: string | null
          disclaimer_snippet_id: string | null
          gate_state: Json | null
          id: string
          is_thread: boolean
          needs_disclaimer: boolean
          pain_point_id: string | null
          pending_decision: Json | null
          post_form: string | null
          publish_attempts: number
          publish_error: string | null
          publish_locked_at: string | null
          published_at: string | null
          published_url: string | null
          question_count: number
          research_links: Json
          scheduled_for: string | null
          score: number | null
          slug: string
          social_account_id: string | null
          source: string | null
          source_interaction_id: string | null
          status: string
          title: string | null
          topic_tags: string[] | null
          type: string
          updated_at: string
          validated: boolean
          workflow_run_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          beat_id?: string | null
          body?: string | null
          campaign_id?: string | null
          char_count?: number | null
          compliance_checked_at?: string | null
          compliance_classification?: string | null
          compliance_overridden_by?: string | null
          compliance_rationale?: string | null
          compliance_status?: string | null
          created_at?: string
          created_by?: string | null
          disclaimer_snippet_id?: string | null
          gate_state?: Json | null
          id?: string
          is_thread?: boolean
          needs_disclaimer?: boolean
          pain_point_id?: string | null
          pending_decision?: Json | null
          post_form?: string | null
          publish_attempts?: number
          publish_error?: string | null
          publish_locked_at?: string | null
          published_at?: string | null
          published_url?: string | null
          question_count?: number
          research_links?: Json
          scheduled_for?: string | null
          score?: number | null
          slug?: string
          social_account_id?: string | null
          source?: string | null
          source_interaction_id?: string | null
          status?: string
          title?: string | null
          topic_tags?: string[] | null
          type: string
          updated_at?: string
          validated?: boolean
          workflow_run_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          beat_id?: string | null
          body?: string | null
          campaign_id?: string | null
          char_count?: number | null
          compliance_checked_at?: string | null
          compliance_classification?: string | null
          compliance_overridden_by?: string | null
          compliance_rationale?: string | null
          compliance_status?: string | null
          created_at?: string
          created_by?: string | null
          disclaimer_snippet_id?: string | null
          gate_state?: Json | null
          id?: string
          is_thread?: boolean
          needs_disclaimer?: boolean
          pain_point_id?: string | null
          pending_decision?: Json | null
          post_form?: string | null
          publish_attempts?: number
          publish_error?: string | null
          publish_locked_at?: string | null
          published_at?: string | null
          published_url?: string | null
          question_count?: number
          research_links?: Json
          scheduled_for?: string | null
          score?: number | null
          slug?: string
          social_account_id?: string | null
          source?: string | null
          source_interaction_id?: string | null
          status?: string
          title?: string | null
          topic_tags?: string[] | null
          type?: string
          updated_at?: string
          validated?: boolean
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_beat_id_fkey"
            columns: ["beat_id"]
            isOneToOne: false
            referencedRelation: "campaign_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_compliance_overridden_by_fkey"
            columns: ["compliance_overridden_by"]
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
            foreignKeyName: "content_items_disclaimer_snippet_id_fkey"
            columns: ["disclaimer_snippet_id"]
            isOneToOne: false
            referencedRelation: "compliance_snippets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_pain_point_id_fkey"
            columns: ["pain_point_id"]
            isOneToOne: false
            referencedRelation: "pain_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["account_id"]
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
      corporate_lexicon: {
        Row: {
          approved_by: string | null
          category: string | null
          created_at: string
          created_by: string | null
          definition: string | null
          example_usage: string | null
          id: string
          professional_term: string
          status: string
          term: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          definition?: string | null
          example_usage?: string | null
          id?: string
          professional_term: string
          status?: string
          term: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_by?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          definition?: string | null
          example_usage?: string | null
          id?: string
          professional_term?: string
          status?: string
          term?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "corporate_lexicon_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_lexicon_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      deck_slides: {
        Row: {
          content_json: Json
          created_at: string
          deck_id: string
          id: string
          notes: string | null
          order_index: number
          type: string
          updated_at: string
        }
        Insert: {
          content_json?: Json
          created_at?: string
          deck_id: string
          id?: string
          notes?: string | null
          order_index: number
          type: string
          updated_at?: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          deck_id?: string
          id?: string
          notes?: string | null
          order_index?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deck_slides_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          aspect_ratio: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          slug: string
          status: string
          theme_id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          slug?: string
          status?: string
          theme_id?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aspect_ratio?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          slug?: string
          status?: string
          theme_id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      discovery_interviews: {
        Row: {
          channel: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          email_thread_id: string | null
          id: string
          interview_date: string | null
          notes: string | null
          pain_points: string[] | null
          status: string
          trigger_event:
            | Database["public"]["Enums"]["trigger_event_type"]
            | null
          updated_at: string
        }
        Insert: {
          channel?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          email_thread_id?: string | null
          id?: string
          interview_date?: string | null
          notes?: string | null
          pain_points?: string[] | null
          status?: string
          trigger_event?:
            | Database["public"]["Enums"]["trigger_event_type"]
            | null
          updated_at?: string
        }
        Update: {
          channel?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          email_thread_id?: string | null
          id?: string
          interview_date?: string | null
          notes?: string | null
          pain_points?: string[] | null
          status?: string
          trigger_event?:
            | Database["public"]["Enums"]["trigger_event_type"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_interviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_interviews_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_interviews_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          document_id: string
          embedding: string | null
          id: string
          page_from: number | null
          page_to: number | null
        }
        Insert: {
          chunk_index: number
          content: string
          document_id: string
          embedding?: string | null
          id?: string
          page_from?: number | null
          page_to?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          document_id?: string
          embedding?: string | null
          id?: string
          page_from?: number | null
          page_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "research_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_company_facts"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_research_absences"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_research_ledger"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "v_research_publishable"
            referencedColumns: ["source_document_id"]
          },
        ]
      }
      document_versions: {
        Row: {
          approved_by: string | null
          content: Json
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          status: string
          version_number: number
        }
        Insert: {
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          status?: string
          version_number: number
        }
        Update: {
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          slug: string
          tags: string[]
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          slug?: string
          tags?: string[]
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          slug?: string
          tags?: string[]
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      economic_indicators: {
        Row: {
          alert_change_threshold: number | null
          alert_on_new_print: boolean
          category: string
          created_at: string
          created_by: string | null
          decimals: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          period_granularity: string
          poll_frequency: string
          provider: string
          provider_series_code: string | null
          provider_table_ref: string | null
          region: string
          short_label: string
          unit: string
          updated_at: string
        }
        Insert: {
          alert_change_threshold?: number | null
          alert_on_new_print?: boolean
          category: string
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          period_granularity?: string
          poll_frequency?: string
          provider: string
          provider_series_code?: string | null
          provider_table_ref?: string | null
          region: string
          short_label: string
          unit: string
          updated_at?: string
        }
        Update: {
          alert_change_threshold?: number | null
          alert_on_new_print?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          decimals?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          period_granularity?: string
          poll_frequency?: string
          provider?: string
          provider_series_code?: string | null
          provider_table_ref?: string | null
          region?: string
          short_label?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "economic_indicators_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ecosystem_changes: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          advisor_partner_id: string | null
          change_type: string
          client_relevant: boolean
          compliance_class: string | null
          compliance_notes: string | null
          created_at: string
          curator_note: string | null
          dedup_key: string
          detected_at: string
          entity_name: string
          external_url: string | null
          id: string
          materiality: number | null
          occurred_at: string | null
          payload: Json
          pinned: boolean
          product_service_id: string | null
          severity: string | null
          source: string
          status: string
          summary: string | null
          title: string
          updated_at: string
          watch_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          advisor_partner_id?: string | null
          change_type: string
          client_relevant?: boolean
          compliance_class?: string | null
          compliance_notes?: string | null
          created_at?: string
          curator_note?: string | null
          dedup_key: string
          detected_at?: string
          entity_name: string
          external_url?: string | null
          id?: string
          materiality?: number | null
          occurred_at?: string | null
          payload?: Json
          pinned?: boolean
          product_service_id?: string | null
          severity?: string | null
          source?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          watch_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          advisor_partner_id?: string | null
          change_type?: string
          client_relevant?: boolean
          compliance_class?: string | null
          compliance_notes?: string | null
          created_at?: string
          curator_note?: string | null
          dedup_key?: string
          detected_at?: string
          entity_name?: string
          external_url?: string | null
          id?: string
          materiality?: number | null
          occurred_at?: string | null
          payload?: Json
          pinned?: boolean
          product_service_id?: string | null
          severity?: string | null
          source?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecosystem_changes_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_changes_advisor_partner_id_fkey"
            columns: ["advisor_partner_id"]
            isOneToOne: false
            referencedRelation: "advisors_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_changes_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_changes_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "ecosystem_watches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_changes_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "v_ecosystem_watch_health"
            referencedColumns: ["id"]
          },
        ]
      }
      ecosystem_watches: {
        Row: {
          advisor_partner_id: string | null
          centrality: number
          check_frequency: string
          config: Json
          consecutive_failures: number
          created_at: string
          created_by: string | null
          enabled: boolean
          health: string
          id: string
          label: string
          last_change_at: string | null
          last_checked_at: string | null
          last_state: Json | null
          notes: string | null
          owner_id: string | null
          product_service_id: string | null
          source_url: string | null
          updated_at: string
          watch_type: string
        }
        Insert: {
          advisor_partner_id?: string | null
          centrality?: number
          check_frequency?: string
          config?: Json
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          health?: string
          id?: string
          label: string
          last_change_at?: string | null
          last_checked_at?: string | null
          last_state?: Json | null
          notes?: string | null
          owner_id?: string | null
          product_service_id?: string | null
          source_url?: string | null
          updated_at?: string
          watch_type: string
        }
        Update: {
          advisor_partner_id?: string | null
          centrality?: number
          check_frequency?: string
          config?: Json
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          health?: string
          id?: string
          label?: string
          last_change_at?: string | null
          last_checked_at?: string | null
          last_state?: Json | null
          notes?: string | null
          owner_id?: string | null
          product_service_id?: string | null
          source_url?: string | null
          updated_at?: string
          watch_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecosystem_watches_advisor_partner_id_fkey"
            columns: ["advisor_partner_id"]
            isOneToOne: false
            referencedRelation: "advisors_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_watches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_watches_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_watches_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      fastmail_accounts: {
        Row: {
          consecutive_failures: number
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_error_at: string | null
          research_folder: string | null
          token: string
          updated_at: string
          username: string
          watched_addresses: string[]
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          research_folder?: string | null
          token: string
          updated_at?: string
          username: string
          watched_addresses?: string[]
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_error_at?: string | null
          research_folder?: string | null
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
          research_query_state: string | null
          sent_query_state: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          id?: string
          inbox_query_state?: string | null
          jmap_account_id?: string | null
          last_synced_at?: string | null
          research_query_state?: string | null
          sent_query_state?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          id?: string
          inbox_query_state?: string | null
          jmap_account_id?: string | null
          last_synced_at?: string | null
          research_query_state?: string | null
          sent_query_state?: string | null
          updated_at?: string
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
      feedback: {
        Row: {
          category: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          date_received: string | null
          deleted_at: string | null
          description: string
          id: string
          pain_point_id: string | null
          rating: number | null
          sentiment: Json | null
          source: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          pain_point_id?: string | null
          rating?: number | null
          sentiment?: Json | null
          source?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          date_received?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          pain_point_id?: string | null
          rating?: number | null
          sentiment?: Json | null
          source?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_pain_point_id_fkey"
            columns: ["pain_point_id"]
            isOneToOne: false
            referencedRelation: "pain_points"
            referencedColumns: ["id"]
          },
        ]
      }
      field_source_minimums: {
        Row: {
          field_key: string
          min_source_rank: number
          rationale: string | null
        }
        Insert: {
          field_key: string
          min_source_rank: number
          rationale?: string | null
        }
        Update: {
          field_key?: string
          min_source_rank?: number
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_source_minimums_min_source_rank_fkey"
            columns: ["min_source_rank"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["rank"]
          },
          {
            foreignKeyName: "field_source_minimums_min_source_rank_fkey"
            columns: ["min_source_rank"]
            isOneToOne: false
            referencedRelation: "v_company_facts"
            referencedColumns: ["source_rank"]
          },
          {
            foreignKeyName: "field_source_minimums_min_source_rank_fkey"
            columns: ["min_source_rank"]
            isOneToOne: false
            referencedRelation: "v_research_ledger"
            referencedColumns: ["source_rank"]
          },
          {
            foreignKeyName: "field_source_minimums_min_source_rank_fkey"
            columns: ["min_source_rank"]
            isOneToOne: false
            referencedRelation: "v_research_publishable"
            referencedColumns: ["source_rank"]
          },
        ]
      }
      finding_divergence_pairs: {
        Row: {
          active: boolean
          break_threshold: number
          corr_window_days: number
          expected_sign: string
          id: string
          primary_key: string
          secondary_key: string
          thesis_note: string | null
        }
        Insert: {
          active?: boolean
          break_threshold?: number
          corr_window_days?: number
          expected_sign: string
          id?: string
          primary_key: string
          secondary_key: string
          thesis_note?: string | null
        }
        Update: {
          active?: boolean
          break_threshold?: number
          corr_window_days?: number
          expected_sign?: string
          id?: string
          primary_key?: string
          secondary_key?: string
          thesis_note?: string | null
        }
        Relationships: []
      }
      finding_metric_config: {
        Row: {
          allowed_vocab: string[]
          metric_group: string
          notes: string | null
          thesis_weight: number
          vol_class: string
        }
        Insert: {
          allowed_vocab?: string[]
          metric_group: string
          notes?: string | null
          thesis_weight?: number
          vol_class?: string
        }
        Update: {
          allowed_vocab?: string[]
          metric_group?: string
          notes?: string | null
          thesis_weight?: number
          vol_class?: string
        }
        Relationships: []
      }
      finding_thresholds: {
        Row: {
          active: boolean
          compliance_class: string
          cross_direction: string
          id: string
          level_name: string
          level_value: number
          metric_key: string
        }
        Insert: {
          active?: boolean
          compliance_class?: string
          cross_direction: string
          id?: string
          level_name: string
          level_value: number
          metric_key: string
        }
        Update: {
          active?: boolean
          compliance_class?: string
          cross_direction?: string
          id?: string
          level_name?: string
          level_value?: number
          metric_key?: string
        }
        Relationships: []
      }
      finding_watch: {
        Row: {
          boost: number
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          note: string | null
          target_ref: string
          target_type: string
        }
        Insert: {
          boost?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          target_ref: string
          target_type: string
        }
        Update: {
          boost?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          target_ref?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_watch_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
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
      fx_rates: {
        Row: {
          base_currency: string
          quote_currency: string
          rate: number
          rate_date: string
          source: string
        }
        Insert: {
          base_currency: string
          quote_currency?: string
          rate: number
          rate_date: string
          source: string
        }
        Update: {
          base_currency?: string
          quote_currency?: string
          rate?: number
          rate_date?: string
          source?: string
        }
        Relationships: []
      }
      holding_bases: {
        Row: {
          code: string
          comparable: boolean
          description: string
          label: string
        }
        Insert: {
          code: string
          comparable?: boolean
          description: string
          label: string
        }
        Update: {
          code?: string
          comparable?: boolean
          description?: string
          label?: string
        }
        Relationships: []
      }
      indicator_observations: {
        Row: {
          created_at: string
          id: string
          indicator_id: string
          is_current: boolean
          is_revision: boolean
          period_date: string
          raw: Json
          released_at: string
          source: string
          superseded_value: number | null
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_id: string
          is_current?: boolean
          is_revision?: boolean
          period_date: string
          raw?: Json
          released_at: string
          source: string
          superseded_value?: number | null
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          indicator_id?: string
          is_current?: boolean
          is_revision?: boolean
          period_date?: string
          raw?: Json
          released_at?: string
          source?: string
          superseded_value?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "indicator_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "economic_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "v_indicator_latest"
            referencedColumns: ["indicator_id"]
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
      jurisdiction_notes: {
        Row: {
          applies_to_listing_type: string | null
          applies_to_standard: string | null
          applies_to_venue: string | null
          body: string
          created_at: string
          id: string
          is_published: boolean
          note_key: string
          primary_source_url: string | null
          rule_reference: string | null
          title: string
          topic: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          applies_to_listing_type?: string | null
          applies_to_standard?: string | null
          applies_to_venue?: string | null
          body: string
          created_at?: string
          id?: string
          is_published?: boolean
          note_key: string
          primary_source_url?: string | null
          rule_reference?: string | null
          title: string
          topic: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          applies_to_listing_type?: string | null
          applies_to_standard?: string | null
          applies_to_venue?: string | null
          body?: string
          created_at?: string
          id?: string
          is_published?: boolean
          note_key?: string
          primary_source_url?: string | null
          rule_reference?: string | null
          title?: string
          topic?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
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
      library_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_by: string | null
          citations: Json
          created_at: string
          error: string | null
          id: string
          lex_verdict: Json | null
          no_answer: boolean
          question: string
          status: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_by?: string | null
          citations?: Json
          created_at?: string
          error?: string | null
          id?: string
          lex_verdict?: Json | null
          no_answer?: boolean
          question: string
          status?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_by?: string | null
          citations?: Json
          created_at?: string
          error?: string | null
          id?: string
          lex_verdict?: Json | null
          no_answer?: boolean
          question?: string
          status?: string
        }
        Relationships: []
      }
      market_report_feedback: {
        Row: {
          created_at: string
          created_by: string | null
          distilled_at: string | null
          feedback: string
          id: string
          market_report_id: string | null
          narration_excerpt: string | null
          verdict: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          distilled_at?: string | null
          feedback: string
          id?: string
          market_report_id?: string | null
          narration_excerpt?: string | null
          verdict?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          distilled_at?: string | null
          feedback?: string
          id?: string
          market_report_id?: string | null
          narration_excerpt?: string | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_report_feedback_market_report_id_fkey"
            columns: ["market_report_id"]
            isOneToOne: false
            referencedRelation: "market_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      market_report_guidelines: {
        Row: {
          guidelines: Json
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          guidelines?: Json
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          guidelines?: Json
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      market_reports: {
        Row: {
          as_of: string
          created_at: string
          emailed: boolean
          findings: Json
          id: string
          lex_result: Json | null
          lint_result: Json | null
          narration_markdown: string | null
          ops_findings: Json
          report_mode: string
          status: string
          updated_at: string
        }
        Insert: {
          as_of: string
          created_at?: string
          emailed?: boolean
          findings?: Json
          id?: string
          lex_result?: Json | null
          lint_result?: Json | null
          narration_markdown?: string | null
          ops_findings?: Json
          report_mode: string
          status: string
          updated_at?: string
        }
        Update: {
          as_of?: string
          created_at?: string
          emailed?: boolean
          findings?: Json
          id?: string
          lex_result?: Json | null
          lint_result?: Json | null
          narration_markdown?: string | null
          ops_findings?: Json
          report_mode?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_configs: {
        Row: {
          created_at: string
          id: string
          model_id: string
          scope_key: string
          scope_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_id: string
          scope_key: string
          scope_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string
          scope_key?: string
          scope_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      mvp_template_versions: {
        Row: {
          approved_by: string | null
          content: Json
          created_at: string
          created_by: string | null
          id: string
          status: string
          template_id: string
          version_number: number
        }
        Insert: {
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          template_id: string
          version_number: number
        }
        Update: {
          approved_by?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "mvp_template_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_template_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mvp_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "mvp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mvp_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          slug: string
          tags: string[] | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          slug?: string
          tags?: string[] | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          slug?: string
          tags?: string[] | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mvp_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      news_items: {
        Row: {
          attachment_count: number
          australian_relevance: boolean
          author: string | null
          body_markdown: string | null
          canonical_url: string | null
          category: Database["public"]["Enums"]["news_category"]
          created_at: string
          curator_notes: string | null
          embedding: string | null
          fetched_at: string
          fts: unknown
          has_pdf_attachment: boolean
          id: string
          image_url: string | null
          ingested_by: string
          ingestion_ref: string | null
          key_points: Json
          knowledge_item_id: string | null
          published_at: string | null
          relevance_reasoning: string | null
          relevance_score: number | null
          report_id: string | null
          rex_metadata: Json
          routine_id: string | null
          source_id: string | null
          source_name: string
          status: string
          summary: string | null
          title: string
          topic_tags: string[]
          updated_at: string
          url: string
          url_hash: string | null
        }
        Insert: {
          attachment_count?: number
          australian_relevance?: boolean
          author?: string | null
          body_markdown?: string | null
          canonical_url?: string | null
          category: Database["public"]["Enums"]["news_category"]
          created_at?: string
          curator_notes?: string | null
          embedding?: string | null
          fetched_at?: string
          fts?: unknown
          has_pdf_attachment?: boolean
          id?: string
          image_url?: string | null
          ingested_by?: string
          ingestion_ref?: string | null
          key_points?: Json
          knowledge_item_id?: string | null
          published_at?: string | null
          relevance_reasoning?: string | null
          relevance_score?: number | null
          report_id?: string | null
          rex_metadata?: Json
          routine_id?: string | null
          source_id?: string | null
          source_name?: string
          status?: string
          summary?: string | null
          title: string
          topic_tags?: string[]
          updated_at?: string
          url: string
          url_hash?: string | null
        }
        Update: {
          attachment_count?: number
          australian_relevance?: boolean
          author?: string | null
          body_markdown?: string | null
          canonical_url?: string | null
          category?: Database["public"]["Enums"]["news_category"]
          created_at?: string
          curator_notes?: string | null
          embedding?: string | null
          fetched_at?: string
          fts?: unknown
          has_pdf_attachment?: boolean
          id?: string
          image_url?: string | null
          ingested_by?: string
          ingestion_ref?: string | null
          key_points?: Json
          knowledge_item_id?: string | null
          published_at?: string | null
          relevance_reasoning?: string | null
          relevance_score?: number | null
          report_id?: string | null
          rex_metadata?: Json
          routine_id?: string | null
          source_id?: string | null
          source_name?: string
          status?: string
          summary?: string | null
          title?: string
          topic_tags?: string[]
          updated_at?: string
          url?: string
          url_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_items_knowledge_item_id_fkey"
            columns: ["knowledge_item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "v_recent_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "v_report_watch_health"
            referencedColumns: ["source_id"]
          },
        ]
      }
      news_sources: {
        Row: {
          crawl_delay_seconds: number
          created_at: string
          created_by: string | null
          detection_config: Json
          detection_consecutive_empty: number
          detection_last_success_at: string | null
          detection_strategies: string[]
          feed_url: string | null
          follow_links: boolean
          id: string
          image_url: string | null
          inbound_address: string | null
          is_active: boolean
          last_error: string | null
          last_scanned_at: string | null
          last_status: string | null
          licence_notes: string | null
          max_backfill_episodes: number
          max_candidates_per_run: number
          max_episode_age_days: number | null
          max_followed_links: number
          name: string
          ocr_enabled: boolean
          ocr_page_limit: number
          preferred_transcript_lang: string
          redistribution_default: string
          relevance_threshold: number
          sender_allowlist: string[]
          site_url: string | null
          slug: string | null
          source_type: string
          tier: string | null
          transcribe_with_deepgram: boolean
          updated_at: string
          youtube_channel_url: string | null
        }
        Insert: {
          crawl_delay_seconds?: number
          created_at?: string
          created_by?: string | null
          detection_config?: Json
          detection_consecutive_empty?: number
          detection_last_success_at?: string | null
          detection_strategies?: string[]
          feed_url?: string | null
          follow_links?: boolean
          id?: string
          image_url?: string | null
          inbound_address?: string | null
          is_active?: boolean
          last_error?: string | null
          last_scanned_at?: string | null
          last_status?: string | null
          licence_notes?: string | null
          max_backfill_episodes?: number
          max_candidates_per_run?: number
          max_episode_age_days?: number | null
          max_followed_links?: number
          name: string
          ocr_enabled?: boolean
          ocr_page_limit?: number
          preferred_transcript_lang?: string
          redistribution_default?: string
          relevance_threshold?: number
          sender_allowlist?: string[]
          site_url?: string | null
          slug?: string | null
          source_type?: string
          tier?: string | null
          transcribe_with_deepgram?: boolean
          updated_at?: string
          youtube_channel_url?: string | null
        }
        Update: {
          crawl_delay_seconds?: number
          created_at?: string
          created_by?: string | null
          detection_config?: Json
          detection_consecutive_empty?: number
          detection_last_success_at?: string | null
          detection_strategies?: string[]
          feed_url?: string | null
          follow_links?: boolean
          id?: string
          image_url?: string | null
          inbound_address?: string | null
          is_active?: boolean
          last_error?: string | null
          last_scanned_at?: string | null
          last_status?: string | null
          licence_notes?: string | null
          max_backfill_episodes?: number
          max_candidates_per_run?: number
          max_episode_age_days?: number | null
          max_followed_links?: number
          name?: string
          ocr_enabled?: boolean
          ocr_page_limit?: number
          preferred_transcript_lang?: string
          redistribution_default?: string
          relevance_threshold?: number
          sender_allowlist?: string[]
          site_url?: string | null
          slug?: string | null
          source_type?: string
          tier?: string | null
          transcribe_with_deepgram?: boolean
          updated_at?: string
          youtube_channel_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_runs: {
        Row: {
          approved_story_ids: string[] | null
          audience_context: string | null
          completed_at: string | null
          content_item_id: string | null
          editorial_scores: Json | null
          gate_draft_markdown: string | null
          gate_message: string | null
          id: string
          notes: string | null
          pending_decision: Json | null
          requested_by: string | null
          requested_by_signal: string | null
          shortlist: Json | null
          started_at: string
          status: string
          story_count_target: number
          time_range: string
          total_word_count: number | null
          trigger_source: string
          updated_at: string
          word_count_target: number
          workflow_run_id: string
        }
        Insert: {
          approved_story_ids?: string[] | null
          audience_context?: string | null
          completed_at?: string | null
          content_item_id?: string | null
          editorial_scores?: Json | null
          gate_draft_markdown?: string | null
          gate_message?: string | null
          id?: string
          notes?: string | null
          pending_decision?: Json | null
          requested_by?: string | null
          requested_by_signal?: string | null
          shortlist?: Json | null
          started_at?: string
          status?: string
          story_count_target: number
          time_range: string
          total_word_count?: number | null
          trigger_source: string
          updated_at?: string
          word_count_target: number
          workflow_run_id: string
        }
        Update: {
          approved_story_ids?: string[] | null
          audience_context?: string | null
          completed_at?: string | null
          content_item_id?: string | null
          editorial_scores?: Json | null
          gate_draft_markdown?: string | null
          gate_message?: string | null
          id?: string
          notes?: string | null
          pending_decision?: Json | null
          requested_by?: string | null
          requested_by_signal?: string | null
          shortlist?: Json | null
          started_at?: string
          status?: string
          story_count_target?: number
          time_range?: string
          total_word_count?: number | null
          trigger_source?: string
          updated_at?: string
          word_count_target?: number
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_runs_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_ready_to_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          social_account_id: string
          state: string
        }
        Insert: {
          created_at?: string
          social_account_id: string
          state: string
        }
        Update: {
          created_at?: string
          social_account_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_states_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_states_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["account_id"]
          },
        ]
      }
      onchain_indicators: {
        Row: {
          alert_config: Json
          created_at: string
          created_by: string | null
          decimals: number
          derivation: string
          derivation_spec: Json
          id: string
          is_active: boolean
          is_displayed: boolean
          key: string
          metric_group: string
          name: string
          notes: string | null
          poll_frequency: string
          provider: string | null
          provider_metric_code: string | null
          short_label: string
          unit: string
          updated_at: string
        }
        Insert: {
          alert_config?: Json
          created_at?: string
          created_by?: string | null
          decimals?: number
          derivation?: string
          derivation_spec?: Json
          id?: string
          is_active?: boolean
          is_displayed?: boolean
          key: string
          metric_group: string
          name: string
          notes?: string | null
          poll_frequency?: string
          provider?: string | null
          provider_metric_code?: string | null
          short_label: string
          unit: string
          updated_at?: string
        }
        Update: {
          alert_config?: Json
          created_at?: string
          created_by?: string | null
          decimals?: number
          derivation?: string
          derivation_spec?: Json
          id?: string
          is_active?: boolean
          is_displayed?: boolean
          key?: string
          metric_group?: string
          name?: string
          notes?: string | null
          poll_frequency?: string
          provider?: string | null
          provider_metric_code?: string | null
          short_label?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onchain_indicators_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      onchain_observations: {
        Row: {
          created_at: string
          id: string
          indicator_id: string
          ingested_at: string
          is_current: boolean
          is_revision: boolean
          observed_at: string
          raw: Json
          source: string
          superseded_value: number | null
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          indicator_id: string
          ingested_at?: string
          is_current?: boolean
          is_revision?: boolean
          observed_at: string
          raw?: Json
          source: string
          superseded_value?: number | null
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          indicator_id?: string
          ingested_at?: string
          is_current?: boolean
          is_revision?: boolean
          observed_at?: string
          raw?: Json
          source?: string
          superseded_value?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "onchain_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "onchain_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      pain_point_log: {
        Row: {
          change_type: string
          changed_at: string
          id: number
          interview_id: string | null
          pain_point: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          id?: never
          interview_id?: string | null
          pain_point: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          id?: never
          interview_id?: string | null
          pain_point?: string
        }
        Relationships: [
          {
            foreignKeyName: "pain_point_log_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "discovery_interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      pain_points: {
        Row: {
          content: string
          created_at: string
          id: string
          interview_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          interview_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          interview_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pain_points_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "discovery_interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          created_at: string
          created_by: string | null
          estimated_aum: string | null
          id: string
          market_segment: Database["public"]["Enums"]["persona_market_segment"]
          name: string
          notes: string | null
          objection_bank: string[]
          psychographic_profile: Json | null
          slug: string
          sophistication_level: Database["public"]["Enums"]["persona_sophistication_level"]
          strategic_constraints: Json | null
          success_signals: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimated_aum?: string | null
          id?: string
          market_segment: Database["public"]["Enums"]["persona_market_segment"]
          name: string
          notes?: string | null
          objection_bank?: string[]
          psychographic_profile?: Json | null
          slug?: string
          sophistication_level?: Database["public"]["Enums"]["persona_sophistication_level"]
          strategic_constraints?: Json | null
          success_signals?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimated_aum?: string | null
          id?: string
          market_segment?: Database["public"]["Enums"]["persona_market_segment"]
          name?: string
          notes?: string | null
          objection_bank?: string[]
          psychographic_profile?: Json | null
          slug?: string
          sophistication_level?: Database["public"]["Enums"]["persona_sophistication_level"]
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
      platform_files: {
        Row: {
          bucket: string
          byte_size: number | null
          created_at: string
          id: string
          is_public: boolean
          mime_type: string
          name: string
          org_id: string
          original_filename: string
          storage_path: string
          tags: string[]
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          bucket?: string
          byte_size?: number | null
          created_at?: string
          id?: string
          is_public?: boolean
          mime_type: string
          name: string
          org_id?: string
          original_filename: string
          storage_path: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          byte_size?: number | null
          created_at?: string
          id?: string
          is_public?: boolean
          mime_type?: string
          name?: string
          org_id?: string
          original_filename?: string
          storage_path?: string
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      platform_specs: {
        Row: {
          hashtag_guidance: string | null
          id: string
          image_specs: Json
          max_chars: number
          max_images_per_post: number | null
          max_thread_segments: number | null
          notes: string | null
          platform: string
          premium_max_chars: number | null
          updated_at: string
        }
        Insert: {
          hashtag_guidance?: string | null
          id?: string
          image_specs?: Json
          max_chars: number
          max_images_per_post?: number | null
          max_thread_segments?: number | null
          notes?: string | null
          platform: string
          premium_max_chars?: number | null
          updated_at?: string
        }
        Update: {
          hashtag_guidance?: string | null
          id?: string
          image_specs?: Json
          max_chars?: number
          max_images_per_post?: number | null
          max_thread_segments?: number | null
          notes?: string | null
          platform?: string
          premium_max_chars?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      podcast_collection_items: {
        Row: {
          collection_id: string
          created_at: string
          episode_id: string
          id: string
          position: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          episode_id: string
          id?: string
          position?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          episode_id?: string
          id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "podcast_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "podcast_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_collection_items_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_collection_items_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "v_episode_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_collection_items_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "v_episodes_awaiting_action"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_collection_items_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "v_podcast_ingestion_status"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_collections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          intro: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          intro?: string | null
          slug?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          intro?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      podcast_episodes: {
        Row: {
          audio_mime_type: string | null
          audio_url: string | null
          category: string | null
          chapters: Json
          created_at: string
          created_by: string | null
          curator_note: string | null
          deepgram_request_id: string | null
          description: string | null
          duration_seconds: number | null
          embedded_at: string | null
          episode_number: number | null
          episode_summary: string | null
          episode_url: string | null
          fts: unknown
          guid: string
          has_timestamps: boolean
          id: string
          image_url: string | null
          ingestion_origin: string
          key_takeaways: Json
          mentioned_entities: Json
          pending_action: string | null
          published_at: string | null
          relevance_metadata: Json | null
          relevance_score: number | null
          season: number | null
          slug: string
          source_id: string | null
          summary_approved_at: string | null
          summary_approved_by: string | null
          summary_generated_at: string | null
          summary_lex_verdict: Json | null
          summary_status: string
          title: string
          topic_tags: string[]
          transcript_error: string | null
          transcript_fetched_at: string | null
          transcript_format: string | null
          transcript_lang: string | null
          transcript_raw_url: string | null
          transcript_source: string | null
          transcript_status: string
          transcript_text: string | null
          updated_at: string
          youtube_url: string | null
        }
        Insert: {
          audio_mime_type?: string | null
          audio_url?: string | null
          category?: string | null
          chapters?: Json
          created_at?: string
          created_by?: string | null
          curator_note?: string | null
          deepgram_request_id?: string | null
          description?: string | null
          duration_seconds?: number | null
          embedded_at?: string | null
          episode_number?: number | null
          episode_summary?: string | null
          episode_url?: string | null
          fts?: unknown
          guid: string
          has_timestamps?: boolean
          id?: string
          image_url?: string | null
          ingestion_origin?: string
          key_takeaways?: Json
          mentioned_entities?: Json
          pending_action?: string | null
          published_at?: string | null
          relevance_metadata?: Json | null
          relevance_score?: number | null
          season?: number | null
          slug?: string
          source_id?: string | null
          summary_approved_at?: string | null
          summary_approved_by?: string | null
          summary_generated_at?: string | null
          summary_lex_verdict?: Json | null
          summary_status?: string
          title: string
          topic_tags?: string[]
          transcript_error?: string | null
          transcript_fetched_at?: string | null
          transcript_format?: string | null
          transcript_lang?: string | null
          transcript_raw_url?: string | null
          transcript_source?: string | null
          transcript_status?: string
          transcript_text?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Update: {
          audio_mime_type?: string | null
          audio_url?: string | null
          category?: string | null
          chapters?: Json
          created_at?: string
          created_by?: string | null
          curator_note?: string | null
          deepgram_request_id?: string | null
          description?: string | null
          duration_seconds?: number | null
          embedded_at?: string | null
          episode_number?: number | null
          episode_summary?: string | null
          episode_url?: string | null
          fts?: unknown
          guid?: string
          has_timestamps?: boolean
          id?: string
          image_url?: string | null
          ingestion_origin?: string
          key_takeaways?: Json
          mentioned_entities?: Json
          pending_action?: string | null
          published_at?: string | null
          relevance_metadata?: Json | null
          relevance_score?: number | null
          season?: number | null
          slug?: string
          source_id?: string | null
          summary_approved_at?: string | null
          summary_approved_by?: string | null
          summary_generated_at?: string | null
          summary_lex_verdict?: Json | null
          summary_status?: string
          title?: string
          topic_tags?: string[]
          transcript_error?: string | null
          transcript_fetched_at?: string | null
          transcript_format?: string | null
          transcript_lang?: string | null
          transcript_raw_url?: string | null
          transcript_source?: string | null
          transcript_status?: string
          transcript_text?: string | null
          updated_at?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "podcast_episodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_episodes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_episodes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "v_report_watch_health"
            referencedColumns: ["source_id"]
          },
          {
            foreignKeyName: "podcast_episodes_summary_approved_by_fkey"
            columns: ["summary_approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          clicks: number | null
          comments: number | null
          content_item_id: string
          extra: Json
          id: string
          impressions: number | null
          platform: string | null
          reactions: number | null
          recorded_at: string
          recorded_by: string | null
          reposts: number | null
        }
        Insert: {
          clicks?: number | null
          comments?: number | null
          content_item_id: string
          extra?: Json
          id?: string
          impressions?: number | null
          platform?: string | null
          reactions?: number | null
          recorded_at?: string
          recorded_by?: string | null
          reposts?: number | null
        }
        Update: {
          clicks?: number | null
          comments?: number | null
          content_item_id?: string
          extra?: Json
          id?: string
          impressions?: number | null
          platform?: string | null
          reactions?: number | null
          recorded_at?: string
          recorded_by?: string | null
          reposts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: true
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_metrics_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_metrics_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: true
            referencedRelation: "v_ready_to_post"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_metrics_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      product_key_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          product_service_id: string
          role: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          product_service_id: string
          role?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          product_service_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_key_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_key_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "v_contacts_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_key_contacts_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      product_referral_agreements: {
        Row: {
          active: boolean
          agreement_type: string | null
          counterparty_name: string | null
          created_at: string
          fee_structure: string | null
          id: string
          notes: string | null
          percentage: number | null
          product_service_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          agreement_type?: string | null
          counterparty_name?: string | null
          created_at?: string
          fee_structure?: string | null
          id?: string
          notes?: string | null
          percentage?: number | null
          product_service_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          agreement_type?: string | null
          counterparty_name?: string | null
          created_at?: string
          fee_structure?: string | null
          id?: string
          notes?: string | null
          percentage?: number | null
          product_service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_referral_agreements_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      products_services: {
        Row: {
          australian_owned: boolean
          business_name: string | null
          category: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key_relationship_id: string | null
          logo_url: string | null
          name: string
          product_image_url: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          australian_owned?: boolean
          business_name?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key_relationship_id?: string | null
          logo_url?: string | null
          name: string
          product_image_url?: string | null
          slug?: string
          updated_at?: string
        }
        Update: {
          australian_owned?: boolean
          business_name?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key_relationship_id?: string | null
          logo_url?: string | null
          name?: string
          product_image_url?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_services_key_relationship_id_fkey"
            columns: ["key_relationship_id"]
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
          slug: string
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
          slug?: string
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
          slug?: string
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
      report_candidates: {
        Row: {
          attempts: number
          content_length: number | null
          content_type: string | null
          created_at: string
          discovery_method: string
          etag: string | null
          first_seen_at: string
          http_status: number | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          last_modified: string | null
          last_seen_at: string
          published_at_hint: string | null
          raw_url: string
          report_id: string | null
          skip_reason: string | null
          source_id: string
          status: string
          title_hint: string | null
          updated_at: string
          url: string
          url_hash: string
        }
        Insert: {
          attempts?: number
          content_length?: number | null
          content_type?: string | null
          created_at?: string
          discovery_method: string
          etag?: string | null
          first_seen_at?: string
          http_status?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_modified?: string | null
          last_seen_at?: string
          published_at_hint?: string | null
          raw_url: string
          report_id?: string | null
          skip_reason?: string | null
          source_id: string
          status?: string
          title_hint?: string | null
          updated_at?: string
          url: string
          url_hash: string
        }
        Update: {
          attempts?: number
          content_length?: number | null
          content_type?: string | null
          created_at?: string
          discovery_method?: string
          etag?: string | null
          first_seen_at?: string
          http_status?: number | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_modified?: string | null
          last_seen_at?: string
          published_at_hint?: string | null
          raw_url?: string
          report_id?: string | null
          skip_reason?: string | null
          source_id?: string
          status?: string
          title_hint?: string | null
          updated_at?: string
          url?: string
          url_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_candidates_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_candidates_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "v_recent_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "v_report_watch_health"
            referencedColumns: ["source_id"]
          },
        ]
      }
      report_segments: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          heading_path: string | null
          id: string
          page_number: number | null
          report_id: string
          segment_index: number
          token_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          heading_path?: string | null
          id?: string
          page_number?: number | null
          report_id: string
          segment_index: number
          token_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          heading_path?: string | null
          id?: string
          page_number?: number | null
          report_id?: string
          segment_index?: number
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_segments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_segments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "v_recent_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          body: string | null
          candidate_id: string | null
          canonical_url: string | null
          content_hash: string
          created_at: string
          created_by: string | null
          curator_note: string | null
          extraction_method: string | null
          extraction_metrics: Json
          extraction_quality: string | null
          file_format: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          licence_notes: string | null
          news_item_id: string | null
          ocr_used: boolean
          page_count: number | null
          published_at: string | null
          published_at_source: string | null
          publisher: string | null
          redistribution: string
          report_type: string
          revision_of_report_id: string | null
          source_id: string | null
          source_url: string
          status: string
          storage_path: string | null
          superseded_at: string | null
          tags: string[]
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          body?: string | null
          candidate_id?: string | null
          canonical_url?: string | null
          content_hash: string
          created_at?: string
          created_by?: string | null
          curator_note?: string | null
          extraction_method?: string | null
          extraction_metrics?: Json
          extraction_quality?: string | null
          file_format: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          licence_notes?: string | null
          news_item_id?: string | null
          ocr_used?: boolean
          page_count?: number | null
          published_at?: string | null
          published_at_source?: string | null
          publisher?: string | null
          redistribution?: string
          report_type?: string
          revision_of_report_id?: string | null
          source_id?: string | null
          source_url: string
          status?: string
          storage_path?: string | null
          superseded_at?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          body?: string | null
          candidate_id?: string | null
          canonical_url?: string | null
          content_hash?: string
          created_at?: string
          created_by?: string | null
          curator_note?: string | null
          extraction_method?: string | null
          extraction_metrics?: Json
          extraction_quality?: string | null
          file_format?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          licence_notes?: string | null
          news_item_id?: string | null
          ocr_used?: boolean
          page_count?: number | null
          published_at?: string | null
          published_at_source?: string | null
          publisher?: string | null
          redistribution?: string
          report_type?: string
          revision_of_report_id?: string | null
          source_id?: string | null
          source_url?: string
          status?: string
          storage_path?: string | null
          superseded_at?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "report_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_revision_of_report_id_fkey"
            columns: ["revision_of_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_revision_of_report_id_fkey"
            columns: ["revision_of_report_id"]
            isOneToOne: false
            referencedRelation: "v_recent_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "v_report_watch_health"
            referencedColumns: ["source_id"]
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
      research_classifications: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          classification: string
          classified_at: string
          classified_by: string
          field_key: string
          id: string
          reason: string
          subject_id: string
          subject_table: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          classification?: string
          classified_at?: string
          classified_by?: string
          field_key: string
          id?: string
          reason: string
          subject_id: string
          subject_table: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          classification?: string
          classified_at?: string
          classified_by?: string
          field_key?: string
          id?: string
          reason?: string
          subject_id?: string
          subject_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_classifications_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      research_companies: {
        Row: {
          abn: string | null
          acn: string | null
          arbn: string | null
          created_at: string
          created_by: string | null
          curator_notes: string | null
          expected_disclosure_cadence: string
          financial_year_end: string | null
          functional_currency: string | null
          funding_source: string | null
          id: string
          is_published: boolean
          isin: string | null
          jurisdiction: string
          last_verified_at: string | null
          legal_name: string
          lei: string | null
          market_cap_band: string | null
          operational_hq: string | null
          presentation_currency: string | null
          primary_archetype: string
          reporting_standard: string | null
          self_described_archetype: string | null
          slug: string
          tier: string
          updated_at: string
        }
        Insert: {
          abn?: string | null
          acn?: string | null
          arbn?: string | null
          created_at?: string
          created_by?: string | null
          curator_notes?: string | null
          expected_disclosure_cadence?: string
          financial_year_end?: string | null
          functional_currency?: string | null
          funding_source?: string | null
          id?: string
          is_published?: boolean
          isin?: string | null
          jurisdiction: string
          last_verified_at?: string | null
          legal_name: string
          lei?: string | null
          market_cap_band?: string | null
          operational_hq?: string | null
          presentation_currency?: string | null
          primary_archetype: string
          reporting_standard?: string | null
          self_described_archetype?: string | null
          slug: string
          tier?: string
          updated_at?: string
        }
        Update: {
          abn?: string | null
          acn?: string | null
          arbn?: string | null
          created_at?: string
          created_by?: string | null
          curator_notes?: string | null
          expected_disclosure_cadence?: string
          financial_year_end?: string | null
          functional_currency?: string | null
          funding_source?: string | null
          id?: string
          is_published?: boolean
          isin?: string | null
          jurisdiction?: string
          last_verified_at?: string | null
          legal_name?: string
          lei?: string | null
          market_cap_band?: string | null
          operational_hq?: string | null
          presentation_currency?: string | null
          primary_archetype?: string
          reporting_standard?: string | null
          self_described_archetype?: string | null
          slug?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      research_company_facts: {
        Row: {
          as_of: string | null
          company_id: string
          created_at: string
          field_key: string
          id: string
          is_superseded: boolean
          label: string
          natural_key: string
          source_document_id: string
          superseded_by: string | null
          updated_at: string
          value: string
        }
        Insert: {
          as_of?: string | null
          company_id: string
          created_at?: string
          field_key: string
          id?: string
          is_superseded?: boolean
          label: string
          natural_key: string
          source_document_id: string
          superseded_by?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          as_of?: string | null
          company_id?: string
          created_at?: string
          field_key?: string
          id?: string
          is_superseded?: boolean
          label?: string
          natural_key?: string
          source_document_id?: string
          superseded_by?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_company_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_company_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "research_company_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_company_facts_field_key_fkey"
            columns: ["field_key"]
            isOneToOne: false
            referencedRelation: "field_source_minimums"
            referencedColumns: ["field_key"]
          },
          {
            foreignKeyName: "research_company_facts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "research_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_company_facts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_facts"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_company_facts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_company_facts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_absences"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_company_facts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_ledger"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_company_facts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_publishable"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_company_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "research_company_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_company_facts_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "v_company_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      research_documents: {
        Row: {
          announcement_id: string | null
          company_id: string
          content_sha256: string | null
          created_at: string
          document_type: string
          filing_entity: string | null
          full_text: string | null
          id: string
          is_audited: boolean
          page_count: number | null
          pdf_url: string | null
          published_at: string | null
          retrieval_error: string | null
          retrieved_at: string | null
          source_class: string
          title: string
          venue: string | null
        }
        Insert: {
          announcement_id?: string | null
          company_id: string
          content_sha256?: string | null
          created_at?: string
          document_type: string
          filing_entity?: string | null
          full_text?: string | null
          id?: string
          is_audited?: boolean
          page_count?: number | null
          pdf_url?: string | null
          published_at?: string | null
          retrieval_error?: string | null
          retrieved_at?: string | null
          source_class: string
          title: string
          venue?: string | null
        }
        Update: {
          announcement_id?: string | null
          company_id?: string
          content_sha256?: string | null
          created_at?: string
          document_type?: string
          filing_entity?: string | null
          full_text?: string | null
          id?: string
          is_audited?: boolean
          page_count?: number | null
          pdf_url?: string | null
          published_at?: string | null
          retrieval_error?: string | null
          retrieved_at?: string | null
          source_class?: string
          title?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "research_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_documents_source_class_fkey"
            columns: ["source_class"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["code"]
          },
        ]
      }
      research_findings: {
        Row: {
          company_id: string
          created_at: string
          detail: string | null
          event_id: string | null
          finding_type: string
          headline: string
          id: string
          is_absence: boolean
          is_suppressed: boolean
          materiality: number | null
          natural_key: string
          occurred_on: string | null
          source_document_id: string | null
          subject: string | null
          suppressed_reason: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          detail?: string | null
          event_id?: string | null
          finding_type: string
          headline: string
          id?: string
          is_absence?: boolean
          is_suppressed?: boolean
          materiality?: number | null
          natural_key: string
          occurred_on?: string | null
          source_document_id?: string | null
          subject?: string | null
          suppressed_reason?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          detail?: string | null
          event_id?: string | null
          finding_type?: string
          headline?: string
          id?: string
          is_absence?: boolean
          is_suppressed?: boolean
          materiality?: number | null
          natural_key?: string
          occurred_on?: string | null
          source_document_id?: string | null
          subject?: string | null
          suppressed_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "research_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "treasury_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_research_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "v_research_publishable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "research_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_facts"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_findings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_findings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_absences"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_findings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_ledger"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "research_findings_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_publishable"
            referencedColumns: ["source_document_id"]
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
      segment_scorecards: {
        Row: {
          access_score: number | null
          created_at: string
          id: string
          need_score: number | null
          notes: string | null
          planned_interviews: number
          segment_name: string
          updated_at: string
        }
        Insert: {
          access_score?: number | null
          created_at?: string
          id?: string
          need_score?: number | null
          notes?: string | null
          planned_interviews?: number
          segment_name: string
          updated_at?: string
        }
        Update: {
          access_score?: number | null
          created_at?: string
          id?: string
          need_score?: number | null
          notes?: string | null
          planned_interviews?: number
          segment_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          account_type: string
          api_credentials_ref: string | null
          created_at: string
          created_by: string | null
          display_name: string
          handle: string | null
          id: string
          is_active: boolean
          platform: string
          profile_url: string | null
          team_member_id: string | null
          updated_at: string
          voice_profile: Json
        }
        Insert: {
          account_type: string
          api_credentials_ref?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          handle?: string | null
          id?: string
          is_active?: boolean
          platform: string
          profile_url?: string | null
          team_member_id?: string | null
          updated_at?: string
          voice_profile?: Json
        }
        Update: {
          account_type?: string
          api_credentials_ref?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          handle?: string | null
          id?: string
          is_active?: boolean
          platform?: string
          profile_url?: string | null
          team_member_id?: string | null
          updated_at?: string
          voice_profile?: Json
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      social_credentials: {
        Row: {
          access_token_id: string
          author_urn: string
          connected_by: string | null
          consecutive_failures: number
          created_at: string
          expires_at: string
          id: string
          last_error: string | null
          last_error_at: string | null
          provider: string
          scopes: string[] | null
          social_account_id: string
          updated_at: string
        }
        Insert: {
          access_token_id: string
          author_urn: string
          connected_by?: string | null
          consecutive_failures?: number
          created_at?: string
          expires_at: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          provider?: string
          scopes?: string[] | null
          social_account_id: string
          updated_at?: string
        }
        Update: {
          access_token_id?: string
          author_urn?: string
          connected_by?: string | null
          consecutive_failures?: number
          created_at?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          provider?: string
          scopes?: string[] | null
          social_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_credentials_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_credentials_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_credentials_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: true
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["account_id"]
          },
        ]
      }
      source_classes: {
        Row: {
          code: string
          is_audited: boolean
          label: string
          rank: number
        }
        Insert: {
          code: string
          is_audited?: boolean
          label: string
          rank: number
        }
        Update: {
          code?: string
          is_audited?: boolean
          label?: string
          rank?: number
        }
        Relationships: []
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
          slug: string
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
          slug?: string
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
          slug?: string
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
      thread_segments: {
        Row: {
          body: string
          char_count: number | null
          content_item_id: string
          created_at: string
          id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          body: string
          char_count?: number | null
          content_item_id: string
          created_at?: string
          id?: string
          sequence: number
          updated_at?: string
        }
        Update: {
          body?: string
          char_count?: number | null
          content_item_id?: string
          created_at?: string
          id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_segments_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_segments_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_segments_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "v_ready_to_post"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          end_seconds: number | null
          episode_id: string
          id: string
          segment_index: number
          speaker: string | null
          start_seconds: number | null
          token_count: number | null
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          end_seconds?: number | null
          episode_id: string
          id?: string
          segment_index: number
          speaker?: string | null
          start_seconds?: number | null
          token_count?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          end_seconds?: number | null
          episode_id?: string
          id?: string
          segment_index?: number
          speaker?: string | null
          start_seconds?: number | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "v_episode_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "v_episodes_awaiting_action"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_segments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "v_podcast_ingestion_status"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_events: {
        Row: {
          asset_class: string
          basis: string | null
          company_id: string
          consideration_native: number | null
          created_at: string
          detail: string | null
          disclosure_venue: string | null
          event_date: string
          event_type: string
          fees_included: boolean | null
          filing_entity: string | null
          headline: string
          id: string
          native_currency: string | null
          natural_key: string
          quantity: number | null
          source_document_id: string
          updated_at: string
        }
        Insert: {
          asset_class?: string
          basis?: string | null
          company_id: string
          consideration_native?: number | null
          created_at?: string
          detail?: string | null
          disclosure_venue?: string | null
          event_date: string
          event_type: string
          fees_included?: boolean | null
          filing_entity?: string | null
          headline: string
          id?: string
          native_currency?: string | null
          natural_key: string
          quantity?: number | null
          source_document_id: string
          updated_at?: string
        }
        Update: {
          asset_class?: string
          basis?: string | null
          company_id?: string
          consideration_native?: number | null
          created_at?: string
          detail?: string | null
          disclosure_venue?: string | null
          event_date?: string
          event_type?: string
          fees_included?: boolean | null
          filing_entity?: string | null
          headline?: string
          id?: string
          native_currency?: string | null
          natural_key?: string
          quantity?: number | null
          source_document_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_events_basis_fkey"
            columns: ["basis"]
            isOneToOne: false
            referencedRelation: "holding_bases"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "research_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_facts"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_absences"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_ledger"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_events_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_publishable"
            referencedColumns: ["source_document_id"]
          },
        ]
      }
      treasury_holdings_snapshots: {
        Row: {
          as_of_date: string
          asset: string
          basis: string
          company_id: string
          created_at: string
          id: string
          includes_customer_assets: boolean
          instrument_type: string
          is_related_party_vehicle: boolean
          look_through_btc_equivalent: number | null
          native_currency: string | null
          natural_key: string
          quantity: number
          source_document_id: string
          value_native: number | null
        }
        Insert: {
          as_of_date: string
          asset?: string
          basis: string
          company_id: string
          created_at?: string
          id?: string
          includes_customer_assets?: boolean
          instrument_type?: string
          is_related_party_vehicle?: boolean
          look_through_btc_equivalent?: number | null
          native_currency?: string | null
          natural_key: string
          quantity: number
          source_document_id: string
          value_native?: number | null
        }
        Update: {
          as_of_date?: string
          asset?: string
          basis?: string
          company_id?: string
          created_at?: string
          id?: string
          includes_customer_assets?: boolean
          instrument_type?: string
          is_related_party_vehicle?: boolean
          look_through_btc_equivalent?: number | null
          native_currency?: string | null
          natural_key?: string
          quantity?: number
          source_document_id?: string
          value_native?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_holdings_snapshots_basis_fkey"
            columns: ["basis"]
            isOneToOne: false
            referencedRelation: "holding_bases"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "research_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_facts"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_absences"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_ledger"
            referencedColumns: ["source_document_id"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "v_research_publishable"
            referencedColumns: ["source_document_id"]
          },
        ]
      }
      voice_snippets: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          curator_note: string | null
          embedding: string | null
          id: string
          is_starred: boolean
          platform: string | null
          snippet_type: string
          social_account_id: string | null
          source: string
          source_content_item_id: string | null
          topic_tags: string[]
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          curator_note?: string | null
          embedding?: string | null
          id?: string
          is_starred?: boolean
          platform?: string | null
          snippet_type: string
          social_account_id?: string | null
          source?: string
          source_content_item_id?: string | null
          topic_tags?: string[]
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          curator_note?: string | null
          embedding?: string | null
          id?: string
          is_starred?: boolean
          platform?: string | null
          snippet_type?: string
          social_account_id?: string | null
          source?: string
          source_content_item_id?: string | null
          topic_tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_snippets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_snippets_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_snippets_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "voice_snippets_source_content_item_id_fkey"
            columns: ["source_content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_snippets_source_content_item_id_fkey"
            columns: ["source_content_item_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_matrix"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_snippets_source_content_item_id_fkey"
            columns: ["source_content_item_id"]
            isOneToOne: false
            referencedRelation: "v_ready_to_post"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_progress: {
        Row: {
          step_id: string
          step_label: string
          updated_at: string
          workflow_run_id: string
        }
        Insert: {
          step_id: string
          step_label: string
          updated_at?: string
          workflow_run_id: string
        }
        Update: {
          step_id?: string
          step_label?: string
          updated_at?: string
          workflow_run_id?: string
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
      v_btc_mvrv: {
        Row: {
          mvrv: number | null
          observed_at: string | null
        }
        Relationships: []
      }
      v_btc_trend: {
        Row: {
          above_200d: number | null
          close: number | null
          drawdown_pct: number | null
          ma_200d: number | null
          ma_200w: number | null
          ma_50d: number | null
          ma_cross_spread_pct: number | null
          mayer_multiple: number | null
          observed_at: string | null
          realized_vol_30d: number | null
          rsi_14: number | null
        }
        Relationships: []
      }
      v_btc_trend_metrics: {
        Row: {
          change_since_prior: number | null
          days_since_observed: number | null
          decimals: number | null
          key: string | null
          metric_group: string | null
          name: string | null
          observed_at: string | null
          pct_change_since_prior: number | null
          short_label: string | null
          signal: string | null
          unit: string | null
          value: number | null
        }
        Relationships: []
      }
      v_campaign_matrix: {
        Row: {
          account_id: string | null
          account_name: string | null
          beat_id: string | null
          beat_sequence: number | null
          beat_title: string | null
          campaign_id: string | null
          char_count: number | null
          compliance_classification: string | null
          compliance_status: string | null
          id: string | null
          is_thread: boolean | null
          needs_disclaimer: boolean | null
          platform: string | null
          scheduled_for: string | null
          slug: string | null
          status: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_beat_id_fkey"
            columns: ["beat_id"]
            isOneToOne: false
            referencedRelation: "campaign_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      v_campaign_overview: {
        Row: {
          approved_count: number | null
          days_remaining: number | null
          duration_weeks: number | null
          end_date: string | null
          flagged_count: number | null
          id: string | null
          name: string | null
          objective: string | null
          pending_count: number | null
          published_count: number | null
          slug: string | null
          start_date: string | null
          status: string | null
          total_variants: number | null
        }
        Relationships: []
      }
      v_company_facts: {
        Row: {
          as_of: string | null
          company_id: string | null
          conflicting_source_class: string | null
          conflicting_source_title: string | null
          conflicting_source_url: string | null
          conflicting_value: string | null
          field_key: string | null
          id: string | null
          label: string | null
          slug: string | null
          source_class: string | null
          source_document_id: string | null
          source_is_audited: boolean | null
          source_published_at: string | null
          source_rank: number | null
          source_title: string | null
          source_url: string | null
          value: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_company_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_company_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "research_company_facts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_company_facts_field_key_fkey"
            columns: ["field_key"]
            isOneToOne: false
            referencedRelation: "field_source_minimums"
            referencedColumns: ["field_key"]
          },
          {
            foreignKeyName: "research_documents_source_class_fkey"
            columns: ["conflicting_source_class"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "research_documents_source_class_fkey"
            columns: ["source_class"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["code"]
          },
        ]
      }
      v_company_position: {
        Row: {
          as_of_date: string | null
          asset: string | null
          basis: string | null
          basis_comparable: boolean | null
          company_id: string | null
          includes_customer_assets: boolean | null
          instrument_type: string | null
          is_related_party_vehicle: boolean | null
          legal_name: string | null
          look_through_btc_equivalent: number | null
          primary_archetype: string | null
          quantity: number | null
          slug: string | null
          snapshot_id: string | null
          source_class: string | null
          source_document_id: string | null
          source_published_at: string | null
          source_title: string | null
          source_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_documents_source_class_fkey"
            columns: ["source_class"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "treasury_holdings_snapshots_basis_fkey"
            columns: ["basis"]
            isOneToOne: false
            referencedRelation: "holding_bases"
            referencedColumns: ["code"]
          },
        ]
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
      v_ecosystem_feed: {
        Row: {
          advisor_partner_id: string | null
          advisor_slug: string | null
          advisor_type: string | null
          change_type: string | null
          client_relevant: boolean | null
          compliance_class: string | null
          curator_note: string | null
          detected_at: string | null
          entity_name: string | null
          external_url: string | null
          id: string | null
          materiality: number | null
          occurred_at: string | null
          owner_name: string | null
          pinned: boolean | null
          product_category: string | null
          product_service_id: string | null
          product_slug: string | null
          severity: string | null
          status: string | null
          summary: string | null
          title: string | null
          watch_label: string | null
          watch_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ecosystem_changes_advisor_partner_id_fkey"
            columns: ["advisor_partner_id"]
            isOneToOne: false
            referencedRelation: "advisors_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecosystem_changes_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      v_ecosystem_watch_health: {
        Row: {
          check_frequency: string | null
          consecutive_failures: number | null
          days_since_check: number | null
          enabled: boolean | null
          entity_name: string | null
          health: string | null
          id: string | null
          label: string | null
          last_change_at: string | null
          last_checked_at: string | null
          owner_name: string | null
          watch_type: string | null
        }
        Relationships: []
      }
      v_episode_library: {
        Row: {
          audio_url: string | null
          category: string | null
          chapters: Json | null
          duration_seconds: number | null
          episode_summary: string | null
          id: string | null
          image_url: string | null
          key_takeaways: Json | null
          published_at: string | null
          relevance_score: number | null
          slug: string | null
          source_name: string | null
          title: string | null
          topic_tags: string[] | null
          youtube_url: string | null
        }
        Relationships: []
      }
      v_episodes_awaiting_action: {
        Row: {
          deepgram_request_id: string | null
          id: string | null
          source_name: string | null
          title: string | null
          transcribe_with_deepgram: boolean | null
          transcript_error: string | null
          transcript_status: string | null
        }
        Relationships: []
      }
      v_etf_flow_streak: {
        Row: {
          direction: string | null
          observed_at: string | null
          streak_sessions: number | null
          streak_total: number | null
        }
        Relationships: []
      }
      v_hash_ribbons: {
        Row: {
          hash_rate_eh_s: number | null
          ma30: number | null
          ma60: number | null
          observed_at: string | null
          signal: string | null
          spread_pct: number | null
        }
        Relationships: []
      }
      v_indicator_latest: {
        Row: {
          category: string | null
          change_since_prior: number | null
          current_value: number | null
          days_since_release: number | null
          decimals: number | null
          expected_next_release: string | null
          indicator_id: string | null
          is_revision: boolean | null
          name: string | null
          pct_change_since_prior: number | null
          period_date: string | null
          period_granularity: string | null
          prior_value: number | null
          region: string | null
          released_at: string | null
          short_label: string | null
          superseded_value: number | null
          typical_release_gap_days: number | null
          unit: string | null
          year_ago_period: string | null
          year_ago_value: number | null
          yoy_change: number | null
          yoy_pct_change: number | null
        }
        Relationships: []
      }
      v_indicator_series: {
        Row: {
          indicator_id: string | null
          period_date: string | null
          released_at: string | null
          short_label: string | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indicator_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "economic_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "v_indicator_latest"
            referencedColumns: ["indicator_id"]
          },
        ]
      }
      v_onchain_dashboard: {
        Row: {
          change_since_prior: number | null
          days_since_observed: number | null
          decimals: number | null
          key: string | null
          metric_group: string | null
          name: string | null
          observed_at: string | null
          pct_change_since_prior: number | null
          short_label: string | null
          signal: string | null
          unit: string | null
          value: number | null
        }
        Relationships: []
      }
      v_onchain_series: {
        Row: {
          indicator_id: string | null
          key: string | null
          observed_at: string | null
          short_label: string | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "onchain_observations_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "onchain_indicators"
            referencedColumns: ["id"]
          },
        ]
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
      v_podcast_ingestion_status: {
        Row: {
          audio_url: string | null
          embedded_at: string | null
          has_timestamps: boolean | null
          id: string | null
          published_at: string | null
          slug: string | null
          source_name: string | null
          title: string | null
          transcribe_with_deepgram: boolean | null
          transcript_error: string | null
          transcript_source: string | null
          transcript_status: string | null
          youtube_url: string | null
        }
        Relationships: []
      }
      v_ready_to_post: {
        Row: {
          account_name: string | null
          body: string | null
          campaign_id: string | null
          disclaimer_text: string | null
          id: string | null
          is_thread: boolean | null
          platform: string | null
          profile_url: string | null
          scheduled_for: string | null
          title: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_campaign_overview"
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
      v_recent_reports: {
        Row: {
          curator_note: string | null
          days_since_published: number | null
          extraction_quality: string | null
          file_format: string | null
          id: string | null
          news_item_id: string | null
          news_item_status: string | null
          ocr_used: boolean | null
          page_count: number | null
          published_at: string | null
          publisher: string | null
          redistribution: string | null
          relevance_score: number | null
          report_type: string | null
          source_name: string | null
          source_url: string | null
          status: string | null
          title: string | null
          word_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_news_item_id_fkey"
            columns: ["news_item_id"]
            isOneToOne: false
            referencedRelation: "news_items"
            referencedColumns: ["id"]
          },
        ]
      }
      v_report_watch_health: {
        Row: {
          acquired_30d: number | null
          candidates_30d: number | null
          days_since_candidate: number | null
          detection_consecutive_empty: number | null
          detection_last_success_at: string | null
          detection_strategies: string[] | null
          failed_total: number | null
          is_active: boolean | null
          latest_report_published_at: string | null
          name: string | null
          source_id: string | null
        }
        Insert: {
          acquired_30d?: never
          candidates_30d?: never
          days_since_candidate?: never
          detection_consecutive_empty?: number | null
          detection_last_success_at?: string | null
          detection_strategies?: string[] | null
          failed_total?: never
          is_active?: boolean | null
          latest_report_published_at?: never
          name?: string | null
          source_id?: string | null
        }
        Update: {
          acquired_30d?: never
          candidates_30d?: never
          days_since_candidate?: never
          detection_consecutive_empty?: number | null
          detection_last_success_at?: string | null
          detection_strategies?: string[] | null
          failed_total?: never
          is_active?: boolean | null
          latest_report_published_at?: never
          name?: string | null
          source_id?: string | null
        }
        Relationships: []
      }
      v_research_absences: {
        Row: {
          company_id: string | null
          detail: string | null
          headline: string | null
          id: string | null
          occurred_on: string | null
          slug: string | null
          source_class: string | null
          source_document_id: string | null
          source_is_audited: boolean | null
          source_published_at: string | null
          source_title: string | null
          source_url: string | null
          subject: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_documents_source_class_fkey"
            columns: ["source_class"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "research_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "research_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
        ]
      }
      v_research_freshness: {
        Row: {
          days_since_document: number | null
          expected_disclosure_cadence: string | null
          id: string | null
          is_stale: boolean | null
          last_verified_at: string | null
          latest_document_at: string | null
          legal_name: string | null
          slug: string | null
          stale_after_days: number | null
          tier: string | null
        }
        Relationships: []
      }
      v_research_ledger: {
        Row: {
          asset_class: string | null
          basis: string | null
          basis_comparable: boolean | null
          classification: string | null
          company_id: string | null
          consideration_aud: number | null
          consideration_native: number | null
          detail: string | null
          disclosure_venue: string | null
          event_date: string | null
          event_type: string | null
          fees_included: boolean | null
          filing_entity: string | null
          fx_rate_date: string | null
          fx_rate_used: number | null
          headline: string | null
          id: string | null
          legal_name: string | null
          native_currency: string | null
          quantity: number | null
          slug: string | null
          source_class: string | null
          source_document_id: string | null
          source_is_audited: boolean | null
          source_published_at: string | null
          source_rank: number | null
          source_title: string | null
          source_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_documents_source_class_fkey"
            columns: ["source_class"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "treasury_events_basis_fkey"
            columns: ["basis"]
            isOneToOne: false
            referencedRelation: "holding_bases"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
        ]
      }
      v_research_publishable: {
        Row: {
          asset_class: string | null
          basis: string | null
          basis_comparable: boolean | null
          classification: string | null
          company_id: string | null
          consideration_aud: number | null
          consideration_native: number | null
          detail: string | null
          disclosure_venue: string | null
          event_date: string | null
          event_type: string | null
          fees_included: boolean | null
          filing_entity: string | null
          fx_rate_date: string | null
          fx_rate_used: number | null
          headline: string | null
          id: string | null
          legal_name: string | null
          native_currency: string | null
          quantity: number | null
          slug: string | null
          source_class: string | null
          source_document_id: string | null
          source_is_audited: boolean | null
          source_published_at: string | null
          source_rank: number | null
          source_title: string | null
          source_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_documents_source_class_fkey"
            columns: ["source_class"]
            isOneToOne: false
            referencedRelation: "source_classes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "treasury_events_basis_fkey"
            columns: ["basis"]
            isOneToOne: false
            referencedRelation: "holding_bases"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "research_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_company_position"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "treasury_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_research_freshness"
            referencedColumns: ["id"]
          },
        ]
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
      assert_source_minimum: {
        Args: { doc_id: string; target_field: string }
        Returns: undefined
      }
      commit_research_ingest: { Args: { payload: Json }; Returns: Json }
      compute_pipeline_validation: {
        Args: { pain_point_uuid: string }
        Returns: {
          question_count: number
          validated: boolean
        }[]
      }
      compute_unique_slug: {
        Args: { p_base: string; p_id: string; p_table: string }
        Returns: string
      }
      delete_social_credential: {
        Args: { p_social_account_id: string }
        Returns: undefined
      }
      match_voice_snippets: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_account_id?: string
          p_platform?: string
          p_snippet_types?: string[]
          query_embedding: string
          star_boost?: number
        }
        Returns: {
          body: string
          curator_note: string
          id: string
          is_starred: boolean
          platform: string
          score: number
          similarity: number
          snippet_type: string
          social_account_id: string
          topic_tags: string[]
        }[]
      }
      search_segments: {
        Args: {
          match_count?: number
          query_embedding: string
          source_types?: string[]
        }
        Returns: {
          content: string
          locator: string
          parent_id: string
          parent_title: string
          redistribution: string
          segment_id: string
          similarity: number
          source_type: string
        }[]
      }
      slugify: { Args: { txt: string }; Returns: string }
      social_credential_token: {
        Args: { p_social_account_id: string }
        Returns: string
      }
      store_social_credential: {
        Args: {
          p_author_urn: string
          p_connected_by?: string
          p_expires_at: string
          p_provider?: string
          p_scopes?: string[]
          p_social_account_id: string
          p_token: string
        }
        Returns: undefined
      }
      vector_search_content: {
        Args: {
          filter_days?: number
          filter_source?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          body_excerpt: string
          created_at: string
          similarity: number
          source_id: string
          source_table: string
          summary: string
          title: string
        }[]
      }
      vector_search_news: {
        Args: {
          filter_category?: string
          filter_days?: number
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          category: Database["public"]["Enums"]["news_category"]
          id: string
          published_at: string
          similarity: number
          summary: string
          title: string
          url: string
        }[]
      }
      vector_search_transcripts: {
        Args: {
          filter_days?: number
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          audio_url: string
          content: string
          curator_note: string
          end_seconds: number
          episode_id: string
          episode_title: string
          published_at: string
          segment_id: string
          similarity: number
          source_name: string
          speaker: string
          start_seconds: number
          youtube_url: string
        }[]
      }
    }
    Enums: {
      news_category: "regulatory" | "corporate" | "macro" | "international"
      persona_decision_style:
        | "data_driven"
        | "consensus_seeking"
        | "risk_averse"
        | "opportunistic"
        | "process_oriented"
      persona_market_segment:
        | "sme"
        | "public_company"
        | "family_office"
        | "hnw"
        | "startup"
        | "superannuation"
      persona_sophistication_level: "novice" | "intermediate" | "expert"
      stakeholder_role:
        | "CFO"
        | "CEO"
        | "HR"
        | "Treasury"
        | "PeopleOps"
        | "Other"
      trigger_event_type:
        | "FASB_CHANGE"
        | "EMPLOYEE_BTC_REQUEST"
        | "REGULATORY_UPDATE"
        | "OTHER"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      news_category: ["regulatory", "corporate", "macro", "international"],
      persona_decision_style: [
        "data_driven",
        "consensus_seeking",
        "risk_averse",
        "opportunistic",
        "process_oriented",
      ],
      persona_market_segment: [
        "sme",
        "public_company",
        "family_office",
        "hnw",
        "startup",
        "superannuation",
      ],
      persona_sophistication_level: ["novice", "intermediate", "expert"],
      stakeholder_role: ["CFO", "CEO", "HR", "Treasury", "PeopleOps", "Other"],
      trigger_event_type: [
        "FASB_CHANGE",
        "EMPLOYEE_BTC_REQUEST",
        "REGULATORY_UPDATE",
        "OTHER",
      ],
    },
  },
} as const
