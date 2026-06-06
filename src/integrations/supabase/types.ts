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
      profiles: {
        Row: {
          id: string
          role: string | null
          full_name: string
          phone_number: string | null
          email: string
          preferred_language: string | null
          created_at: string
          mrn: string | null
          mobile: string | null
          dob: string | null
          gender: string | null
          address: string | null
          blood_group: string | null
          height_cm: number | null
          weight_kg: number | null
          allergies: string[] | null
          chronic_conditions: string[] | null
          current_meds: string[] | null
          emergency_contact: string | null
          insurance_provider: string | null
          insurance_number: string | null
          department: string | null
          specialization: string | null
          license_number: string | null
          updated_at: string | null
          password: string
        }
        Insert: {
          id?: string
          role?: string | null
          full_name: string
          phone_number?: string | null
          email: string
          preferred_language?: string | null
          created_at?: string
          mrn?: string | null
          mobile?: string | null
          dob?: string | null
          gender?: string | null
          address?: string | null
          blood_group?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          allergies?: string[] | null
          chronic_conditions?: string[] | null
          current_meds?: string[] | null
          emergency_contact?: string | null
          insurance_provider?: string | null
          insurance_number?: string | null
          department?: string | null
          specialization?: string | null
          license_number?: string | null
          updated_at?: string | null
          password?: string
        }
        Update: {
          id?: string
          role?: string | null
          full_name?: string
          phone_number?: string | null
          email?: string
          preferred_language?: string | null
          created_at?: string
          mrn?: string | null
          mobile?: string | null
          dob?: string | null
          gender?: string | null
          address?: string | null
          blood_group?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          allergies?: string[] | null
          chronic_conditions?: string[] | null
          current_meds?: string[] | null
          emergency_contact?: string | null
          insurance_provider?: string | null
          insurance_number?: string | null
          department?: string | null
          specialization?: string | null
          license_number?: string | null
          updated_at?: string | null
          password?: string
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          id: string
          hospital_name: string
          hospital_code: string
          address: string | null
          departments: string[] | null
        }
        Insert: {
          id?: string
          hospital_name: string
          hospital_code: string
          address?: string | null
          departments?: string[] | null
        }
        Update: {
          id?: string
          hospital_name?: string
          hospital_code?: string
          address?: string | null
          departments?: string[] | null
        }
        Relationships: []
      }
      user_hospital_affiliations: {
        Row: {
          id: string
          user_id: string | null
          hospital_id: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          hospital_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          hospital_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_hospital_affiliations_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hospital_affiliations_hospital_id_fkey"
            columns: ["hospital_id"]
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          }
        ]
      }
      consultations: {
        Row: {
          id: string
          patient_id: string | null
          hospital_id: string | null
          assigned_doctor_id: string | null
          status: string
          severity_score: number | null
          created_at: string
          updated_at: string
          intake_summary: string | null
          chief_complaint: string | null
          follow_up_recommendation: string | null
          completed_at: string | null
          symptoms: Json | null
          diagnosis: string | null
          icd10_code: string | null
          transcript: string | null
          medications: Json | null
          doctor_notes: string | null
          original_language: string | null
          intake_original_transcript: string | null
          intake_english_translation: string | null
          consult_original_transcript: string | null
          consult_english_transcript: string | null
          record_name: string | null
        }
        Insert: {
          id: string
          patient_id?: string | null
          hospital_id?: string | null
          assigned_doctor_id?: string | null
          status?: string
          severity_score?: number | null
          created_at?: string
          updated_at?: string
          intake_summary?: string | null
          chief_complaint?: string | null
          follow_up_recommendation?: string | null
          completed_at?: string | null
          symptoms?: Json | null
          diagnosis?: string | null
          icd10_code?: string | null
          transcript?: string | null
          medications?: Json | null
          doctor_notes?: string | null
          original_language?: string | null
          intake_original_transcript?: string | null
          intake_english_translation?: string | null
          consult_original_transcript?: string | null
          consult_english_transcript?: string | null
          record_name?: string | null
        }
        Update: {
          id?: string
          patient_id?: string | null
          hospital_id?: string | null
          assigned_doctor_id?: string | null
          status?: string
          severity_score?: number | null
          created_at?: string
          updated_at?: string
          intake_summary?: string | null
          chief_complaint?: string | null
          follow_up_recommendation?: string | null
          completed_at?: string | null
          symptoms?: Json | null
          diagnosis?: string | null
          icd10_code?: string | null
          transcript?: string | null
          medications?: Json | null
          doctor_notes?: string | null
          original_language?: string | null
          intake_original_transcript?: string | null
          intake_english_translation?: string | null
          consult_original_transcript?: string | null
          consult_english_transcript?: string | null
          record_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_hospital_id_fkey"
            columns: ["hospital_id"]
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          }
        ]
      }
      patient_agent_chats: {
        Row: {
          id: string
          consultation_id: string | null
          patient_id: string | null
          chat_history: Json | null
          extracted_symptoms: Json | null
          pdf_report_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          consultation_id?: string | null
          patient_id?: string | null
          chat_history?: Json | null
          extracted_symptoms?: Json | null
          pdf_report_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          consultation_id?: string | null
          patient_id?: string | null
          chat_history?: Json | null
          extracted_symptoms?: Json | null
          pdf_report_url?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_agent_chats_consultation_id_fkey"
            columns: ["consultation_id"]
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_agent_chats_patient_id_fkey"
            columns: ["patient_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      ehr_records: {
        Row: {
          id: string
          consultation_id: string | null
          doctor_id: string | null
          audio_transcript: string | null
          diagnosis: string | null
          icd_10_codes: Json | null
          prescriptions: Json | null
          conflict_warnings: Json | null
          is_draft: boolean
          approved_at: string | null
          discharge_summary_url: string | null
          created_at: string
          updated_at: string
          doctor_analysis: string | null
          clinical_notes: string | null
          ai_fields: Json | null
          safety_alerts: Json | null
          treatment_status: string | null
          follow_up: string | null
          im_report_data: Json | null
        }
        Insert: {
          id?: string
          consultation_id?: string | null
          doctor_id?: string | null
          audio_transcript?: string | null
          diagnosis?: string | null
          icd_10_codes?: Json | null
          prescriptions?: Json | null
          conflict_warnings?: Json | null
          is_draft?: boolean
          approved_at?: string | null
          discharge_summary_url?: string | null
          created_at?: string
          updated_at?: string
          doctor_analysis?: string | null
          clinical_notes?: string | null
          ai_fields?: Json | null
          safety_alerts?: Json | null
          treatment_status?: string | null
          follow_up?: string | null
          im_report_data?: Json | null
        }
        Update: {
          id?: string
          consultation_id?: string | null
          doctor_id?: string | null
          audio_transcript?: string | null
          diagnosis?: string | null
          icd_10_codes?: Json | null
          prescriptions?: Json | null
          conflict_warnings?: Json | null
          is_draft?: boolean
          approved_at?: string | null
          discharge_summary_url?: string | null
          created_at?: string
          updated_at?: string
          doctor_analysis?: string | null
          clinical_notes?: string | null
          ai_fields?: Json | null
          safety_alerts?: Json | null
          treatment_status?: string | null
          follow_up?: string | null
          im_report_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ehr_records_consultation_id_fkey"
            columns: ["consultation_id"]
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ehr_records_doctor_id_fkey"
            columns: ["doctor_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      audit_logs: {
        Row: {
          id: string
          table_name: string
          record_id: string
          actor_id: string | null
          action_type: string
          previous_state: Json | null
          new_state: Json | null
          created_at: string
          actor_name: string | null
          action: string | null
          entity: string | null
          note: string | null
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          actor_id?: string | null
          action_type: string
          previous_state?: Json | null
          new_state?: Json | null
          created_at?: string
          actor_name?: string | null
          action?: string | null
          entity?: string | null
          note?: string | null
        }
        Update: {
          id?: string
          table_name?: string
          record_id?: string
          actor_id?: string | null
          action_type?: string
          previous_state?: Json | null
          new_state?: Json | null
          created_at?: string
          actor_name?: string | null
          action?: string | null
          entity?: string | null
          note?: string | null
        }
        Relationships: []
      }
      patient_follow_ups: {
        Row: {
          id: string
          consultation_id: string | null
          patient_id: string | null
          notification_type: string
          message_content: string
          scheduled_for: string
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          consultation_id?: string | null
          patient_id?: string | null
          notification_type: string
          message_content: string
          scheduled_for: string
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          consultation_id?: string | null
          patient_id?: string | null
          notification_type?: string
          message_content?: string
          scheduled_for?: string
          status?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_follow_ups_consultation_id_fkey"
            columns: ["consultation_id"]
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      generated_documents: {
        Row: {
          id: string
          consultation_id: string | null
          document_type: string
          language: string | null
          storage_url: string
          generated_by: string
          created_at: string
        }
        Insert: {
          id?: string
          consultation_id?: string | null
          document_type: string
          language?: string | null
          storage_url: string
          generated_by: string
          created_at?: string
        }
        Update: {
          id?: string
          consultation_id?: string | null
          document_type?: string
          language?: string | null
          storage_url?: string
          generated_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_consultation_id_fkey"
            columns: ["consultation_id"]
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          }
        ]
      }
      consultation_messages: {
        Row: {
          id: string
          consultation_id: string | null
          role: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          consultation_id?: string | null
          role: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          consultation_id?: string | null
          role?: string
          content?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_messages_consultation_id_fkey"
            columns: ["consultation_id"]
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          }
        ]
      }
      ai_model_configs: {
        Row: {
          id: string
          agent_name: string
          model_name: string
          version: string
          is_active: boolean
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          agent_name: string
          model_name: string
          version?: string
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          agent_name?: string
          model_name?: string
          version?: string
          is_active?: boolean
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
