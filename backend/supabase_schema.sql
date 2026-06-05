-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role text DEFAULT 'patient'::text,
  full_name text NOT NULL,
  phone_number text,
  email text NOT NULL UNIQUE,
  preferred_language text DEFAULT 'English'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  mrn text,
  mobile text,
  dob text,
  gender text,
  address text,
  blood_group text,
  height_cm numeric,
  weight_kg numeric,
  allergies ARRAY DEFAULT '{}'::text[],
  chronic_conditions ARRAY DEFAULT '{}'::text[],
  current_meds ARRAY DEFAULT '{}'::text[],
  emergency_contact text,
  insurance_provider text,
  insurance_number text,
  department text,
  specialization text,
  license_number text,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  password text NOT NULL DEFAULT '123456'::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.hospitals (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  hospital_name text NOT NULL,
  hospital_code text NOT NULL UNIQUE,
  address text,
  departments ARRAY DEFAULT '{}'::text[],
  CONSTRAINT hospitals_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_hospital_affiliations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  hospital_id uuid,
  CONSTRAINT user_hospital_affiliations_pkey PRIMARY KEY (id),
  CONSTRAINT user_hospital_affiliations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_hospital_affiliations_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id)
);
CREATE TABLE public.consultations (
  id text NOT NULL,
  patient_id uuid,
  hospital_id uuid,
  assigned_doctor_id uuid,
  status text NOT NULL DEFAULT 'drafting'::text,
  severity_score integer CHECK (severity_score >= 1 AND severity_score <= 5),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  intake_summary text,
  chief_complaint text,
  follow_up_recommendation text,
  completed_at timestamp with time zone,
  symptoms jsonb DEFAULT '[]'::jsonb,
  diagnosis text DEFAULT ''::text,
  icd10_code text DEFAULT ''::text,
  transcript text DEFAULT ''::text,
  medications jsonb DEFAULT '[]'::jsonb,
  doctor_notes text DEFAULT ''::text,
  original_language text DEFAULT 'en-IN'::text,
  intake_original_transcript text DEFAULT ''::text,
  intake_english_translation text DEFAULT ''::text,
  consult_original_transcript text DEFAULT ''::text,
  consult_english_transcript text DEFAULT ''::text,
  CONSTRAINT consultations_pkey PRIMARY KEY (id),
  CONSTRAINT consultations_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id),
  CONSTRAINT consultations_assigned_doctor_id_fkey FOREIGN KEY (assigned_doctor_id) REFERENCES public.profiles(id),
  CONSTRAINT consultations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.patient_agent_chats (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  consultation_id text,
  patient_id uuid,
  chat_history jsonb DEFAULT '[]'::jsonb,
  extracted_symptoms jsonb,
  pdf_report_url text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT patient_agent_chats_pkey PRIMARY KEY (id),
  CONSTRAINT patient_agent_chats_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.consultations(id),
  CONSTRAINT patient_agent_chats_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.ehr_records (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  consultation_id text UNIQUE,
  doctor_id uuid,
  audio_transcript text,
  diagnosis text,
  icd_10_codes jsonb DEFAULT '[]'::jsonb,
  prescriptions jsonb DEFAULT '[]'::jsonb,
  conflict_warnings jsonb DEFAULT '[]'::jsonb,
  is_draft boolean NOT NULL DEFAULT true,
  approved_at timestamp with time zone,
  discharge_summary_url text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  doctor_analysis text,
  clinical_notes text,
  ai_fields jsonb,
  safety_alerts jsonb,
  treatment_status text DEFAULT 'TREATMENT_ONGOING'::text,
  follow_up text,
  im_report_data jsonb,
  CONSTRAINT ehr_records_pkey PRIMARY KEY (id),
  CONSTRAINT ehr_records_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.consultations(id),
  CONSTRAINT ehr_records_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  actor_id uuid,
  action_type text NOT NULL,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  actor_name text,
  action text,
  entity text,
  note text,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.patient_follow_ups (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  consultation_id text,
  patient_id uuid,
  notification_type text NOT NULL,
  message_content text NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT patient_follow_ups_pkey PRIMARY KEY (id),
  CONSTRAINT patient_follow_ups_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.consultations(id),
  CONSTRAINT patient_follow_ups_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.generated_documents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  consultation_id text,
  document_type text NOT NULL,
  language text DEFAULT 'English'::text,
  storage_url text NOT NULL,
  generated_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT generated_documents_pkey PRIMARY KEY (id),
  CONSTRAINT generated_documents_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.consultations(id)
);
CREATE TABLE public.consultation_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  consultation_id text,
  role text NOT NULL CHECK (role = ANY (ARRAY['agent'::text, 'patient'::text, 'system'::text])),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT consultation_messages_pkey PRIMARY KEY (id),
  CONSTRAINT consultation_messages_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.consultations(id)
);
CREATE TABLE public.ai_model_configs (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  agent_name text NOT NULL,
  model_name text NOT NULL,
  version text NOT NULL DEFAULT '1.0.0'::text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_model_configs_pkey PRIMARY KEY (id)
);