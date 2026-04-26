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
          pain_point_id: string | null
          published_at: string | null
          published_url: string | null
          question_count: number
          research_links: Json
          scheduled_for: string | null
          score: number | null
          source: string | null
          source_interaction_id: string | null
          status: string
          title: string | null
          topic_tags: string[] | null
          type: string
          updated_at: string
          validated: boolean
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          pain_point_id?: string | null
          published_at?: string | null
          published_url?: string | null
          question_count?: number
          research_links?: Json
          scheduled_for?: string | null
          score?: number | null
          source?: string | null
          source_interaction_id?: string | null
          status?: string
          title?: string | null
          topic_tags?: string[] | null
          type: string
          updated_at?: string
          validated?: boolean
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          pain_point_id?: string | null
          published_at?: string | null
          published_url?: string | null
          question_count?: number
          research_links?: Json
          scheduled_for?: string | null
          score?: number | null
          source?: string | null
          source_interaction_id?: string | null
          status?: string
          title?: string | null
          topic_tags?: string[] | null
          type?: string
          updated_at?: string
          validated?: boolean
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
            foreignKeyName: "content_items_pain_point_id_fkey"
            columns: ["pain_point_id"]
            isOneToOne: false
            referencedRelation: "pain_points"
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
          updated_at: string
        }
        Insert: {
          account_id: string
          id?: string
          inbox_query_state?: string | null
          jmap_account_id?: string | null
          last_synced_at?: string | null
          sent_query_state?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          id?: string
          inbox_query_state?: string | null
          jmap_account_id?: string | null
          last_synced_at?: string | null
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
          australian_relevance: boolean
          body_markdown: string | null
          category: Database["public"]["Enums"]["news_category"]
          created_at: string
          embedding: string | null
          fetched_at: string
          fts: unknown
          id: string
          ingested_by: string
          key_points: Json
          knowledge_item_id: string | null
          published_at: string | null
          relevance_score: number | null
          routine_id: string | null
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
          australian_relevance?: boolean
          body_markdown?: string | null
          category: Database["public"]["Enums"]["news_category"]
          created_at?: string
          embedding?: string | null
          fetched_at?: string
          fts?: unknown
          id?: string
          ingested_by?: string
          key_points?: Json
          knowledge_item_id?: string | null
          published_at?: string | null
          relevance_score?: number | null
          routine_id?: string | null
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
          australian_relevance?: boolean
          body_markdown?: string | null
          category?: Database["public"]["Enums"]["news_category"]
          created_at?: string
          embedding?: string | null
          fetched_at?: string
          fts?: unknown
          id?: string
          ingested_by?: string
          key_points?: Json
          knowledge_item_id?: string | null
          published_at?: string | null
          relevance_score?: number | null
          routine_id?: string | null
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
            foreignKeyName: "news_items_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
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
      compute_pipeline_validation: {
        Args: { pain_point_uuid: string }
        Returns: {
          question_count: number
          validated: boolean
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
