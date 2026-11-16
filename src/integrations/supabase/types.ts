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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json | null
          enterprise_id: string | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json | null
          enterprise_id?: string | null
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json | null
          enterprise_id?: string | null
          entity?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: []
      }
      beneficial_owners: {
        Row: {
          control_role: string | null
          created_at: string
          enterprise_id: string
          full_name: string
          id: string
          kyc_status: string
          ownership_pct: number
        }
        Insert: {
          control_role?: string | null
          created_at?: string
          enterprise_id: string
          full_name: string
          id?: string
          kyc_status?: string
          ownership_pct: number
        }
        Update: {
          control_role?: string | null
          created_at?: string
          enterprise_id?: string
          full_name?: string
          id?: string
          kyc_status?: string
          ownership_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "beneficial_owners_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_items: {
        Row: {
          created_at: string
          due_date: string
          enterprise_id: string
          finding: string | null
          id: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          due_date: string
          enterprise_id: string
          finding?: string | null
          id?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          due_date?: string
          enterprise_id?: string
          finding?: string | null
          id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_items_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          is_internal: boolean
          name: string
        }
        Insert: {
          code: string
          is_internal?: boolean
          name: string
        }
        Update: {
          code?: string
          is_internal?: boolean
          name?: string
        }
        Relationships: []
      }
      disclosures: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string
          category: string
          created_at: string
          enterprise_id: string
          id: string
          risk_level: string | null
          status: string
          title: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body: string
          category?: string
          created_at?: string
          enterprise_id: string
          id?: string
          risk_level?: string | null
          status?: string
          title: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          category?: string
          created_at?: string
          enterprise_id?: string
          id?: string
          risk_level?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "disclosures_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_documents: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          doc_type: string
          enterprise_id: string
          id: string
          sha256: string | null
          signed_at: string | null
          signed_by: string | null
          status: string
          title: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          doc_type: string
          enterprise_id: string
          id?: string
          sha256?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          doc_type?: string
          enterprise_id?: string
          id?: string
          sha256?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_documents_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_members: {
        Row: {
          enterprise_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          enterprise_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          enterprise_id?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_members_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprises: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          enterprise_code: string | null
          entity_type: string
          equity_mode: string | null
          exchange_registration_status: string
          id: string
          is_demo: boolean
          is_template: boolean
          jurisdiction: string
          ledger_currencies: string[]
          legal_name: string
          membership_accepted: boolean
          membership_accepted_at: string | null
          public_summary: string | null
          registration_number: string | null
          registry_membership_status: string
          standards_version: string | null
          status: string
          trade_name: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          enterprise_code?: string | null
          entity_type: string
          equity_mode?: string | null
          exchange_registration_status?: string
          id?: string
          is_demo?: boolean
          is_template?: boolean
          jurisdiction: string
          ledger_currencies?: string[]
          legal_name: string
          membership_accepted?: boolean
          membership_accepted_at?: string | null
          public_summary?: string | null
          registration_number?: string | null
          registry_membership_status?: string
          standards_version?: string | null
          status?: string
          trade_name?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          enterprise_code?: string | null
          entity_type?: string
          equity_mode?: string | null
          exchange_registration_status?: string
          id?: string
          is_demo?: boolean
          is_template?: boolean
          jurisdiction?: string
          ledger_currencies?: string[]
          legal_name?: string
          membership_accepted?: boolean
          membership_accepted_at?: string | null
          public_summary?: string | null
          registration_number?: string | null
          registry_membership_status?: string
          standards_version?: string | null
          status?: string
          trade_name?: string | null
        }
        Relationships: []
      }
      fx_quotes: {
        Row: {
          base_currency: string
          created_by: string | null
          expires_at: string
          fee: number
          id: string
          is_executable: boolean
          quote_currency: string
          quote_kind: string
          quoted_at: string
          rate: number
          source: string
          spread_bps: number
        }
        Insert: {
          base_currency: string
          created_by?: string | null
          expires_at: string
          fee?: number
          id?: string
          is_executable?: boolean
          quote_currency: string
          quote_kind: string
          quoted_at?: string
          rate: number
          source: string
          spread_bps?: number
        }
        Update: {
          base_currency?: string
          created_by?: string | null
          expires_at?: string
          fee?: number
          id?: string
          is_executable?: boolean
          quote_currency?: string
          quote_kind?: string
          quoted_at?: string
          rate?: number
          source?: string
          spread_bps?: number
        }
        Relationships: [
          {
            foreignKeyName: "fx_quotes_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_quotes_quote_currency_fkey"
            columns: ["quote_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      integration_configs: {
        Row: {
          base_url: string | null
          category: string
          id: string
          mode: string
          notes: string | null
          provider: string
          updated_at: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          base_url?: string | null
          category: string
          id?: string
          mode?: string
          notes?: string | null
          provider: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          base_url?: string | null
          category?: string
          id?: string
          mode?: string
          notes?: string | null
          provider?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: []
      }
      investor_requests: {
        Row: {
          body: string
          created_at: string
          enterprise_id: string
          id: string
          kind: string
          response: string | null
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          enterprise_id: string
          id?: string
          kind: string
          response?: string | null
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          enterprise_id?: string
          id?: string
          kind?: string
          response?: string | null
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_requests_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          enterprise_id: string
          id: string
          idempotency_key: string
          is_demo: boolean
          memo: string
          posted_at: string
          posted_by: string | null
          soln_posting_status: string
          soln_ref: string | null
          std_instruction_id: string | null
        }
        Insert: {
          enterprise_id: string
          id?: string
          idempotency_key: string
          is_demo?: boolean
          memo: string
          posted_at?: string
          posted_by?: string | null
          soln_posting_status?: string
          soln_ref?: string | null
          std_instruction_id?: string | null
        }
        Update: {
          enterprise_id?: string
          id?: string
          idempotency_key?: string
          is_demo?: boolean
          memo?: string
          posted_at?: string
          posted_by?: string | null
          soln_posting_status?: string
          soln_ref?: string | null
          std_instruction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          credit: number
          currency: string
          debit: number
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          credit?: number
          currency: string
          debit?: number
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          credit?: number
          currency?: string
          debit?: number
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          currency: string
          enterprise_id: string
          id: string
          name: string
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          currency: string
          enterprise_id: string
          id?: string
          name: string
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          currency?: string
          enterprise_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ledger_accounts_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      market_status: {
        Row: {
          class_id: string
          enterprise_id: string
          halt_reason: string | null
          halted: boolean
          liquidity_status: string
          updated_at: string
        }
        Insert: {
          class_id: string
          enterprise_id: string
          halt_reason?: string | null
          halted?: boolean
          liquidity_status?: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          enterprise_id?: string
          halt_reason?: string | null
          halted?: boolean
          liquidity_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_status_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_status_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          enterprise_id: string | null
          id: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          enterprise_id?: string | null
          id?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          enterprise_id?: string | null
          id?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      offerings: {
        Row: {
          class_id: string
          created_at: string
          currency: string
          enterprise_id: string
          id: string
          offering_type: string
          price: number
          quantity: number
          risk_summary: string | null
          sandbox: boolean
          status: string
          title: string
        }
        Insert: {
          class_id: string
          created_at?: string
          currency?: string
          enterprise_id: string
          id?: string
          offering_type?: string
          price: number
          quantity: number
          risk_summary?: string | null
          sandbox?: boolean
          status?: string
          title: string
        }
        Update: {
          class_id?: string
          created_at?: string
          currency?: string
          enterprise_id?: string
          id?: string
          offering_type?: string
          price?: number
          quantity?: number
          risk_summary?: string | null
          sandbox?: boolean
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "offerings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offerings_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          class_id: string
          created_at: string
          enterprise_id: string
          filled: number
          id: string
          price: number
          quantity: number
          sandbox: boolean
          side: string
          status: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          enterprise_id: string
          filled?: number
          id?: string
          price: number
          quantity: number
          sandbox?: boolean
          side: string
          status?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          enterprise_id?: string
          filled?: number
          id?: string
          price?: number
          quantity?: number
          sandbox?: boolean
          side?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_profiles: {
        Row: {
          created_at: string
          enterprise_id: string
          gsr_sync_status: string
          id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          enterprise_id: string
          gsr_sync_status?: string
          id?: string
          visibility: string
        }
        Update: {
          created_at?: string
          enterprise_id?: string
          gsr_sync_status?: string
          id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_profiles_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_records: {
        Row: {
          corrects_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          enterprise_id: string
          id: string
          metric: string
          narrative: string | null
          period: string
          value: number | null
          verification: string
          visibility: string
        }
        Insert: {
          corrects_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          enterprise_id: string
          id?: string
          metric: string
          narrative?: string | null
          period: string
          value?: number | null
          verification?: string
          visibility?: string
        }
        Update: {
          corrects_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          enterprise_id?: string
          id?: string
          metric?: string
          narrative?: string | null
          period?: string
          value?: number | null
          verification?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_records_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: false
            referencedRelation: "performance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_records_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "performance_records_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          mfa_enrolled: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          mfa_enrolled?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          mfa_enrolled?: boolean
        }
        Relationships: []
      }
      provisioning_tasks: {
        Row: {
          attempts: number
          enterprise_id: string
          id: string
          last_error: string | null
          module: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          enterprise_id: string
          id?: string
          last_error?: string | null
          module: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          enterprise_id?: string
          id?: string
          last_error?: string | null
          module?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_tasks_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      share_classes: {
        Row: {
          authorized: number
          created_at: string
          dividend_rights: string | null
          enterprise_id: string
          id: string
          liquidation_preference: string | null
          name: string
          par_value: number
          transfer_restrictions: string | null
          voting_rights: string
        }
        Insert: {
          authorized: number
          created_at?: string
          dividend_rights?: string | null
          enterprise_id: string
          id?: string
          liquidation_preference?: string | null
          name: string
          par_value?: number
          transfer_restrictions?: string | null
          voting_rights?: string
        }
        Update: {
          authorized?: number
          created_at?: string
          dividend_rights?: string | null
          enterprise_id?: string
          id?: string
          liquidation_preference?: string | null
          name?: string
          par_value?: number
          transfer_restrictions?: string | null
          voting_rights?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_classes_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      share_events: {
        Row: {
          book_entry_id: string | null
          certificate_no: string | null
          class_id: string
          corrects_event_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          enterprise_id: string
          event_type: string
          evidence_hash: string | null
          from_holder: string | null
          id: string
          notes: string | null
          prev_hash: string | null
          price_per_share: number | null
          proposed_by: string | null
          quantity: number
          seq: number
          status: string
          to_holder: string | null
        }
        Insert: {
          book_entry_id?: string | null
          certificate_no?: string | null
          class_id: string
          corrects_event_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          enterprise_id: string
          event_type: string
          evidence_hash?: string | null
          from_holder?: string | null
          id?: string
          notes?: string | null
          prev_hash?: string | null
          price_per_share?: number | null
          proposed_by?: string | null
          quantity: number
          seq?: number
          status?: string
          to_holder?: string | null
        }
        Update: {
          book_entry_id?: string | null
          certificate_no?: string | null
          class_id?: string
          corrects_event_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          enterprise_id?: string
          event_type?: string
          evidence_hash?: string | null
          from_holder?: string | null
          id?: string
          notes?: string | null
          prev_hash?: string | null
          price_per_share?: number | null
          proposed_by?: string | null
          quantity?: number
          seq?: number
          status?: string
          to_holder?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "share_events_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_events_corrects_event_id_fkey"
            columns: ["corrects_event_id"]
            isOneToOne: false
            referencedRelation: "share_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_events_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_events_from_holder_fkey"
            columns: ["from_holder"]
            isOneToOne: false
            referencedRelation: "shareholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_events_to_holder_fkey"
            columns: ["to_holder"]
            isOneToOne: false
            referencedRelation: "shareholders"
            referencedColumns: ["id"]
          },
        ]
      }
      shareholders: {
        Row: {
          created_at: string
          email: string | null
          enterprise_id: string
          holder_type: string
          id: string
          is_demo: boolean
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          enterprise_id: string
          holder_type?: string
          id?: string
          is_demo?: boolean
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          enterprise_id?: string
          holder_type?: string
          id?: string
          is_demo?: boolean
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shareholders_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      site_disclaimers: {
        Row: {
          body: string
          enabled: boolean
          page: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          enabled?: boolean
          page: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          enabled?: boolean
          page?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      soln_account_mappings: {
        Row: {
          created_at: string
          currency: string
          enterprise_id: string | null
          id: string
          last_synced_at: string | null
          local_account_id: string | null
          soln_account_ref: string | null
          subject_kind: string
          sync_status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          currency: string
          enterprise_id?: string | null
          id?: string
          last_synced_at?: string | null
          local_account_id?: string | null
          soln_account_ref?: string | null
          subject_kind: string
          sync_status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          enterprise_id?: string | null
          id?: string
          last_synced_at?: string | null
          local_account_id?: string | null
          soln_account_ref?: string | null
          subject_kind?: string
          sync_status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soln_account_mappings_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "soln_account_mappings_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soln_account_mappings_local_account_id_fkey"
            columns: ["local_account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      soln_balance_cache: {
        Row: {
          as_of: string
          balance: number
          currency: string
          fetched_at: string
          id: string
          mapping_id: string
          source: string
        }
        Insert: {
          as_of: string
          balance: number
          currency: string
          fetched_at?: string
          id?: string
          mapping_id: string
          source?: string
        }
        Update: {
          as_of?: string
          balance?: number
          currency?: string
          fetched_at?: string
          id?: string
          mapping_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "soln_balance_cache_mapping_id_fkey"
            columns: ["mapping_id"]
            isOneToOne: false
            referencedRelation: "soln_account_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      soln_connector_state: {
        Row: {
          api_version: string | null
          environment: string
          id: number
          last_check_at: string | null
          last_error: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_version?: string | null
          environment?: string
          id?: number
          last_check_at?: string | null
          last_error?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_version?: string | null
          environment?: string
          id?: number
          last_check_at?: string | null
          last_error?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      soln_outbox: {
        Row: {
          attempts: number
          created_at: string
          enterprise_id: string | null
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          ref_id: string | null
          soln_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          enterprise_id?: string | null
          id?: string
          idempotency_key: string
          kind: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          ref_id?: string | null
          soln_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          enterprise_id?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          ref_id?: string | null
          soln_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      soln_reconciliation_runs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          matched: number
          mismatched: number
          started_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          matched?: number
          mismatched?: number
          started_by?: string | null
          status: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          matched?: number
          mismatched?: number
          started_by?: string | null
          status?: string
        }
        Relationships: []
      }
      soln_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          payload: Json
          process_error: string | null
          processed: boolean
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          id?: string
          payload: Json
          process_error?: string | null
          processed?: boolean
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          process_error?: string | null
          processed?: boolean
          received_at?: string
        }
        Relationships: []
      }
      std_instructions: {
        Row: {
          adapter: string
          amount: number
          beneficiary: string
          created_at: string
          created_by: string | null
          currency: string
          enterprise_id: string
          external_bank_status: string
          external_ref: string | null
          fx_quote_id: string | null
          id: string
          idempotency_key: string
          is_test: boolean
          purpose: string | null
          soln_posting_status: string
          soln_ref: string | null
          state: string
          target_currency: string | null
          updated_at: string
        }
        Insert: {
          adapter?: string
          amount: number
          beneficiary: string
          created_at?: string
          created_by?: string | null
          currency: string
          enterprise_id: string
          external_bank_status?: string
          external_ref?: string | null
          fx_quote_id?: string | null
          id?: string
          idempotency_key: string
          is_test?: boolean
          purpose?: string | null
          soln_posting_status?: string
          soln_ref?: string | null
          state?: string
          target_currency?: string | null
          updated_at?: string
        }
        Update: {
          adapter?: string
          amount?: number
          beneficiary?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          enterprise_id?: string
          external_bank_status?: string
          external_ref?: string | null
          fx_quote_id?: string | null
          id?: string
          idempotency_key?: string
          is_test?: boolean
          purpose?: string | null
          soln_posting_status?: string
          soln_ref?: string | null
          state?: string
          target_currency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "std_instructions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "std_instructions_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "std_instructions_fx_quote_id_fkey"
            columns: ["fx_quote_id"]
            isOneToOne: false
            referencedRelation: "fx_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "std_instructions_target_currency_fkey"
            columns: ["target_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      std_transitions: {
        Row: {
          actor: string | null
          created_at: string
          external_ref: string | null
          from_state: string | null
          id: number
          instruction_id: string
          note: string | null
          to_state: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          external_ref?: string | null
          from_state?: string | null
          id?: number
          instruction_id: string
          note?: string | null
          to_state: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          external_ref?: string | null
          from_state?: string | null
          id?: number
          instruction_id?: string
          note?: string | null
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "std_transitions_instruction_id_fkey"
            columns: ["instruction_id"]
            isOneToOne: false
            referencedRelation: "std_instructions"
            referencedColumns: ["id"]
          },
        ]
      }
      surveillance_alerts: {
        Row: {
          class_id: string | null
          created_at: string
          enterprise_id: string | null
          id: string
          kind: string
          message: string
          resolution: string | null
          severity: string
          status: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          enterprise_id?: string | null
          id?: string
          kind: string
          message: string
          resolution?: string | null
          severity?: string
          status?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          enterprise_id?: string | null
          id?: string
          kind?: string
          message?: string
          resolution?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "surveillance_alerts_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_settlements: {
        Row: {
          created_at: string
          enterprise_id: string
          external_bank_status: string
          id: string
          idempotency_key: string | null
          last_error: string | null
          performance_record_id: string | null
          share_event_id: string | null
          soln_ref: string | null
          status: string
          trade_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enterprise_id: string
          external_bank_status?: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          performance_record_id?: string | null
          share_event_id?: string | null
          soln_ref?: string | null
          status: string
          trade_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enterprise_id?: string
          external_bank_status?: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          performance_record_id?: string | null
          share_event_id?: string | null
          soln_ref?: string | null
          status?: string
          trade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_settlements_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_settlements_performance_record_id_fkey"
            columns: ["performance_record_id"]
            isOneToOne: false
            referencedRelation: "performance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_settlements_share_event_id_fkey"
            columns: ["share_event_id"]
            isOneToOne: false
            referencedRelation: "share_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_settlements_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: true
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          buy_order: string
          class_id: string
          created_at: string
          enterprise_id: string
          id: string
          price: number
          quantity: number
          sandbox: boolean
          sell_order: string
        }
        Insert: {
          buy_order: string
          class_id: string
          created_at?: string
          enterprise_id: string
          id?: string
          price: number
          quantity: number
          sandbox?: boolean
          sell_order: string
        }
        Update: {
          buy_order?: string
          class_id?: string
          created_at?: string
          enterprise_id?: string
          id?: string
          price?: number
          quantity?: number
          sandbox?: boolean
          sell_order?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_buy_order_fkey"
            columns: ["buy_order"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_enterprise_id_fkey"
            columns: ["enterprise_id"]
            isOneToOne: false
            referencedRelation: "enterprises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_sell_order_fkey"
            columns: ["sell_order"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_balances: {
        Args: { _ent: string }
        Returns: {
          account_id: string
          account_type: string
          balance: number
          code: string
          credits: number
          currency: string
          debits: number
          name: string
        }[]
      }
      apply_trade_settlement_event: {
        Args: {
          _event: string
          _idem: string
          _reason?: string
          _soln_ref?: string
        }
        Returns: string
      }
      can_manage_ent: { Args: { _ent: string }; Returns: boolean }
      can_view_ent: { Args: { _ent: string }; Returns: boolean }
      cancel_order: { Args: { _order: string }; Returns: undefined }
      class_issued: { Args: { _class: string }; Returns: number }
      create_std: {
        Args: {
          _amount: number
          _beneficiary: string
          _currency: string
          _ent: string
          _key: string
          _purpose: string
          _target: string
        }
        Returns: string
      }
      decide_enterprise: {
        Args: { _approve: boolean; _ent: string }
        Returns: undefined
      }
      decide_share_event: {
        Args: { _approve: boolean; _event: string }
        Returns: undefined
      }
      get_cap_table: {
        Args: { _ent: string }
        Returns: {
          class_id: string
          class_name: string
          quantity: number
          shareholder_id: string
          shareholder_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      holder_balance: {
        Args: { _class: string; _holder: string }
        Returns: number
      }
      is_member: { Args: { _ent: string; _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      my_holdings: {
        Args: never
        Returns: {
          class_id: string
          class_name: string
          enterprise_id: string
          legal_name: string
          quantity: number
          shareholder_id: string
        }[]
      }
      place_order: {
        Args: { _class: string; _price: number; _qty: number; _side: string }
        Returns: string
      }
      post_journal: {
        Args: {
          _ent: string
          _key: string
          _lines: Json
          _memo: string
          _std?: string
        }
        Returns: string
      }
      propose_correction: {
        Args: { _event: string; _reason: string }
        Returns: string
      }
      propose_share_event: {
        Args: {
          _book?: string
          _class: string
          _ent: string
          _from: string
          _notes?: string
          _price?: number
          _qty: number
          _to: string
          _type: string
        }
        Returns: string
      }
      provision_enterprise: { Args: { _ent: string }; Returns: undefined }
      public_enterprise_directory: {
        Args: never
        Returns: {
          enterprise_code: string
          entity_type: string
          exchange_registration_status: string
          id: string
          is_demo: boolean
          jurisdiction: string
          legal_name: string
          public_summary: string
          registry_membership_status: string
        }[]
      }
      queue_trade_settlement: { Args: { _trade: string }; Returns: undefined }
      retry_provisioning: { Args: { _task: string }; Returns: undefined }
      run_provision_module: {
        Args: { _ent: string; _module: string }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: undefined
      }
      sign_document: { Args: { _doc: string }; Returns: undefined }
      std_allowed: { Args: { _from: string; _to: string }; Returns: boolean }
      submit_onboarding: { Args: { _payload: Json }; Returns: string }
      transition_std: {
        Args: {
          _external_ref?: string
          _id: string
          _note?: string
          _quote?: string
          _to: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "founding_admin"
        | "registrar"
        | "compliance_officer"
        | "financial_ops"
        | "auditor"
        | "investor"
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
      app_role: [
        "founding_admin",
        "registrar",
        "compliance_officer",
        "financial_ops",
        "auditor",
        "investor",
      ],
    },
  },
} as const
