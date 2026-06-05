-- Supabase Database Schema for MediAgent
-- Run this in your Supabase SQL Editor to set up the required tables.

-- 1. Create Patients Table
CREATE TABLE IF NOT EXISTS public.patients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    age INT DEFAULT 0,
    gender TEXT DEFAULT 'Other',
    language TEXT DEFAULT 'english',
    severity_score INT DEFAULT 1,
    status TEXT DEFAULT 'waiting',
    allergies JSONB DEFAULT '[]'::jsonb,
    medical_history TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Create Consultations Table (Including Multilingual Audit Columns)
CREATE TABLE IF NOT EXISTS public.consultations (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
    symptoms JSONB DEFAULT '[]'::jsonb,
    diagnosis TEXT DEFAULT '',
    icd10_code TEXT DEFAULT '',
    transcript TEXT DEFAULT '',
    medications JSONB DEFAULT '[]'::jsonb,
    doctor_notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    
    -- Multilingual speech and translation audit assets
    original_language TEXT DEFAULT 'en-IN',
    intake_original_transcript TEXT DEFAULT '',
    intake_english_translation TEXT DEFAULT '',
    consult_original_transcript TEXT DEFAULT '',
    consult_english_transcript TEXT DEFAULT ''
);

-- 3. Create Timelines Table for Shared EHR Timeline
CREATE TABLE IF NOT EXISTS public.timelines (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES public.patients(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    details JSONB DEFAULT '{}'::jsonb
);

-- Enable Row Level Security (RLS) or public access depending on deployment needs
-- For this hackathon baseline, you can disable RLS or allow public read/write:
ALTER TABLE public.patients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.timelines DISABLE ROW LEVEL SECURITY;
