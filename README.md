# Mediagent

Mediagent is a next-generation healthcare management platform designed to streamline interactions between patients, doctors, and hospital administrators. Built around cutting-edge AI integration, it acts as a digital triage and consultation copilot to deliver AI-curated "Pre-Consultation Reports", significantly reducing doctor workload while empowering patients with timeline-driven health insights.

## Features

### 👨‍⚕️ Doctor Portal
- **Dashboard & Queue**: Real-time overview of daily appointments and patient waitlists.
- **AI-Assisted Consultations**: Review AI-generated Pre-Consultation Summaries containing subjective symptoms, objective timelines, severity scores, and differential diagnoses.
- **Internal Medicine (IM) Reports**: Quickly finalize reports via dynamic forms (Subjective, Objective, Assessment, Plan) with 1-click PDF export functionality.
- **Patient History**: Access detailed patient records, vitals, ongoing treatments, and past prescriptions.

### 🩺 Patient Portal
- **Dashboard & Profile**: View personal health overviews, appointments, and manage medical backgrounds (allergies, chronic conditions).
- **Pre-Consultation Flow**: Describe symptoms to an AI agent which automatically extracts timelines, symptom progression, and flags urgencies for the doctor.
- **Treatments & Timeline**: Track chronological medical history spanning past consultations to ongoing treatments.
- **Prescriptions**: Access and reference current and past medication.

### 🛠️ Admin Portal
- **Platform Analytics**: Monitor overall platform activity (active users, consultations, finalized reports).
- **AI Model Configuration**: Configure, version, and manage active Large Language Models and Speech-To-Text tools (e.g., *Consultation Agent*, *EHR Agent*, *Patient Agent*).
- **User & Role Management**: RBAC management for Admins, Doctors, and Patients backed by complex Database RLS (Row Level Security).
- **Audit Logs**: Maintain strict security and compliance with comprehensive timeline audit-logging of actions across the system.

## Tech Stack
- **Frontend**: React 19, Vite, TanStack Router (File-based routing)
- **UI & Styling**: Tailwind CSS v4, shadcn/ui, Lucide React
- **Backend & Database**: Supabase (PostgreSQL, complex RLS Policies, Database Triggers)
- **Package Manager**: Bun (`bunfig.toml` guardrails included)

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) installed on your machine.
- [Supabase CLI](https://supabase.com/docs/guides/cli) for local database development (optional, required if changing schemas).

### Installation

1. Install dependencies:
   ```bash
   bun install
   ```

2. Start the development server:
   ```bash
   bun run dev
   ```

3. Access the application in your browser (typically at `http://localhost:5173`).