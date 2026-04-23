export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatar_url: string | null;
          tier: "free" | "basic" | "premium";
          credit_balance: number;
          stripe_customer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          avatar_url?: string | null;
          tier?: "free" | "basic" | "premium";
          credit_balance?: number;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          avatar_url?: string | null;
          tier?: "free" | "basic" | "premium";
          credit_balance?: number;
          stripe_customer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      surveys: {
        Row: {
          id: string;
          user_id: string;
          question: string;
          response_type: "likert" | "open_ended";
          model: string;
          hive_size: number;
          demographic_filters: Json;
          location: Json | null;
          persona_source:
            | "microdata"
            | "synthetic_fallback"
            | "legacy_personas"
            | null;
          status: "pending" | "processing" | "completed" | "failed";
          credits_used: number;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          question: string;
          response_type: "likert" | "open_ended";
          model: string;
          hive_size: number;
          demographic_filters?: Json;
          location?: Json | null;
          persona_source?:
            | "microdata"
            | "synthetic_fallback"
            | "legacy_personas"
            | null;
          status?: "pending" | "processing" | "completed" | "failed";
          credits_used?: number;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          question?: string;
          response_type?: "likert" | "open_ended";
          model?: string;
          hive_size?: number;
          demographic_filters?: Json;
          location?: Json | null;
          persona_source?:
            | "microdata"
            | "synthetic_fallback"
            | "legacy_personas"
            | null;
          status?: "pending" | "processing" | "completed" | "failed";
          credits_used?: number;
          created_at?: string;
          completed_at?: string | null;
        };
      };
      respondents: {
        Row: {
          id: string;
          survey_id: string;
          age: number;
          income: number;
          state: string;
          weight: number | null;
          sex: string | null;
          race_ethnicity: string | null;
          occupation: string | null;
          is_college_student: boolean | null;
          is_disabled: boolean | null;
          tenure_type: string | null;
          has_children: boolean | null;
          children_count: number | null;
          insurance_type: string | null;
          receives_benefits: boolean | null;
          zip_code: string | null;
          congressional_district: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          survey_id: string;
          age: number;
          income: number;
          state: string;
          weight?: number | null;
          sex?: string | null;
          race_ethnicity?: string | null;
          occupation?: string | null;
          is_college_student?: boolean | null;
          is_disabled?: boolean | null;
          tenure_type?: string | null;
          has_children?: boolean | null;
          children_count?: number | null;
          insurance_type?: string | null;
          receives_benefits?: boolean | null;
          zip_code?: string | null;
          congressional_district?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          survey_id?: string;
          age?: number;
          income?: number;
          state?: string;
          weight?: number | null;
          sex?: string | null;
          race_ethnicity?: string | null;
          occupation?: string | null;
          is_college_student?: boolean | null;
          is_disabled?: boolean | null;
          tenure_type?: string | null;
          has_children?: boolean | null;
          children_count?: number | null;
          insurance_type?: string | null;
          receives_benefits?: boolean | null;
          zip_code?: string | null;
          congressional_district?: string | null;
          created_at?: string;
        };
      };
      responses: {
        Row: {
          id: string;
          survey_id: string;
          respondent_id: string;
          likert_response:
            | "strongly_disagree"
            | "disagree"
            | "neutral"
            | "agree"
            | "strongly_agree"
            | null;
          open_ended_response: string | null;
          reasoning: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          survey_id: string;
          respondent_id: string;
          likert_response?:
            | "strongly_disagree"
            | "disagree"
            | "neutral"
            | "agree"
            | "strongly_agree"
            | null;
          open_ended_response?: string | null;
          reasoning?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          survey_id?: string;
          respondent_id?: string;
          likert_response?:
            | "strongly_disagree"
            | "disagree"
            | "neutral"
            | "agree"
            | "strongly_agree"
            | null;
          open_ended_response?: string | null;
          reasoning?: string | null;
          created_at?: string;
        };
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: "grant" | "usage" | "purchase" | "refund";
          description: string | null;
          survey_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: "grant" | "usage" | "purchase" | "refund";
          description?: string | null;
          survey_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          type?: "grant" | "usage" | "purchase" | "refund";
          description?: string | null;
          survey_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      subscription_tier: "free" | "basic" | "premium";
      survey_status: "pending" | "processing" | "completed" | "failed";
      response_type: "likert" | "open_ended";
      likert_scale:
        | "strongly_disagree"
        | "disagree"
        | "neutral"
        | "agree"
        | "strongly_agree";
      transaction_type: "grant" | "usage" | "purchase" | "refund";
    };
  };
};
