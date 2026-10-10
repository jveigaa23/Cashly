// Gerado a partir do schema do projeto Supabase (generate_typescript_types).
// Não editar à mão: regenerar após cada migração (os auxiliares no fim do
// arquivo foram reduzidos ao `Tables<>` usado pelo projeto).
// Atenção: colunas NUMERIC aparecem como `number` porque o PostgREST as envia
// como número JSON. Converta SEMPRE com `decimalToCents` (src/lib/format/money.ts).

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
      accounts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          kind: string
          name: string
          opening_balance: number
          opening_date: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          kind?: string
          name: string
          opening_balance?: number
          opening_date?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          kind?: string
          name?: string
          opening_balance?: number
          opening_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          changes: Json
          entity: string
          entity_id: string
          household_id: string
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          changes: Json
          entity: string
          entity_id: string
          household_id: string
          id?: never
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          changes?: Json
          entity?: string
          entity_id?: string
          household_id?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_payments: {
        Row: {
          amount: number
          bill_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          charges_amount: number
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          installment_id: string | null
          note: string | null
          paid_on: string
          principal_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          bill_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          charges_amount?: number
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          installment_id?: string | null
          note?: string | null
          paid_on: string
          principal_amount: number
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          charges_amount?: number
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          installment_id?: string | null
          note?: string | null
          paid_on?: string
          principal_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_household_id_bill_id_fkey"
            columns: ["household_id", "bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "bill_payments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_household_id_installment_id_fkey"
            columns: ["household_id", "installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      bills: {
        Row: {
          cancel_reason: string | null
          canceled_at: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          fine_percent: number
          household_id: string
          id: string
          interest_basis: string
          interest_period: string | null
          interest_rate: number
          name: string
          original_amount: number
          recurrence_date: string | null
          recurrence_rule_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          canceled_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          fine_percent?: number
          household_id: string
          id?: string
          interest_basis?: string
          interest_period?: string | null
          interest_rate?: number
          name: string
          original_amount: number
          recurrence_date?: string | null
          recurrence_rule_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          canceled_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          fine_percent?: number
          household_id?: string
          id?: string
          interest_basis?: string
          interest_period?: string | null
          interest_rate?: number
          name?: string
          original_amount?: number
          recurrence_date?: string | null
          recurrence_rule_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_household_id_category_id_fkey"
            columns: ["household_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "bills_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_household_id_recurrence_rule_id_fkey"
            columns: ["household_id", "recurrence_rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      budgets: {
        Row: {
          alert_percent: number
          category_id: string | null
          category_kind: string
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          limit_amount: number
          month: string
          updated_at: string
        }
        Insert: {
          alert_percent?: number
          category_id?: string | null
          category_kind?: string
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          limit_amount: number
          month: string
          updated_at?: string
        }
        Update: {
          alert_percent?: number
          category_id?: string | null
          category_kind?: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          limit_amount?: number
          month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_household_id_category_kind_category_id_fkey"
            columns: ["household_id", "category_kind", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["household_id", "kind", "id"]
          },
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          household_id: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          household_id: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          household_id?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          display_name: string
          household_id: string
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          household_id: string
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      installment_plans: {
        Row: {
          cancel_reason: string | null
          canceled_at: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          first_due_date: string
          household_id: string
          id: string
          installment_count: number
          interest_method: string
          interest_rate: number
          kind: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          canceled_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          first_due_date: string
          household_id: string
          id?: string
          installment_count: number
          interest_method?: string
          interest_rate?: number
          kind: string
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          canceled_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          first_due_date?: string
          household_id?: string
          id?: string
          installment_count?: number
          interest_method?: string
          interest_rate?: number
          kind?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_household_id_category_id_fkey"
            columns: ["household_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "installment_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string
          expected_amount: number
          household_id: string
          id: string
          number: number
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date: string
          expected_amount: number
          household_id: string
          id?: string
          number: number
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string
          expected_amount?: number
          household_id?: string
          id?: string
          number?: number
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_household_id_plan_id_fkey"
            columns: ["household_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "installment_plans"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          error_code: string | null
          event: string
          household_id: string
          id: string
          member_id: string
          read_at: string | null
          reference_id: string
          reference_type: string
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          error_code?: string | null
          event: string
          household_id: string
          id?: string
          member_id: string
          read_at?: string | null
          reference_id: string
          reference_type: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          error_code?: string | null
          event?: string
          household_id?: string
          id?: string
          member_id?: string
          read_at?: string | null
          reference_id?: string
          reference_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_household_id_member_id_fkey"
            columns: ["household_id", "member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          created_at: string
          days_before: number
          enabled: boolean
          event: string
          household_id: string
          id: string
          member_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          days_before?: number
          enabled?: boolean
          event: string
          household_id: string
          id?: string
          member_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          days_before?: number
          enabled?: boolean
          event?: string
          household_id?: string
          id?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_household_id_member_id_fkey"
            columns: ["household_id", "member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          endpoint: string
          expired_at: string | null
          household_id: string
          id: string
          member_id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth_secret: string
          created_at?: string
          endpoint: string
          expired_at?: string | null
          household_id: string
          id?: string
          member_id: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth_secret?: string
          created_at?: string
          endpoint?: string
          expired_at?: string | null
          household_id?: string
          id?: string
          member_id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_household_id_member_id_fkey"
            columns: ["household_id", "member_id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
      recurrence_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          day_of_month: number | null
          ends_on: string | null
          frequency: string
          household_id: string
          id: string
          interval_count: number
          starts_on: string
          target: string
          template: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          ends_on?: string | null
          frequency: string
          household_id: string
          id?: string
          interval_count?: number
          starts_on: string
          target: string
          template?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          ends_on?: string | null
          frequency?: string
          household_id?: string
          id?: string
          interval_count?: number
          starts_on?: string
          target?: string
          template?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurrence_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          bill_payment_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string
          household_id: string
          id: string
          nature: string | null
          notes: string | null
          occurred_on: string
          payment_method: string | null
          recurrence_date: string | null
          recurrence_rule_id: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          bill_payment_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          household_id: string
          id?: string
          nature?: string | null
          notes?: string | null
          occurred_on: string
          payment_method?: string | null
          recurrence_date?: string | null
          recurrence_rule_id?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          bill_payment_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          household_id?: string
          id?: string
          nature?: string | null
          notes?: string | null
          occurred_on?: string
          payment_method?: string | null
          recurrence_date?: string | null
          recurrence_rule_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_household_id_account_id_fkey"
            columns: ["household_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "transactions_household_id_bill_payment_id_fkey"
            columns: ["household_id", "bill_payment_id"]
            isOneToOne: false
            referencedRelation: "bill_payments"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "transactions_household_id_category_id_fkey"
            columns: ["household_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_recurrence_rule_id_fkey"
            columns: ["household_id", "recurrence_rule_id"]
            isOneToOne: false
            referencedRelation: "recurrence_rules"
            referencedColumns: ["household_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_household_invite: {
        Args: { p_display_name: string; p_token: string }
        Returns: string
      }
      create_household: {
        Args: { p_display_name: string; p_name: string }
        Returns: string
      }
      create_household_invite: { Args: { p_email: string }; Returns: string }
      revoke_household_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
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
  TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableName] extends {
  Row: infer R
}
  ? R
  : never
