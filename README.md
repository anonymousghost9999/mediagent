# MediAgent

MediAgent is a next-generation AI-powered hospital operations platform that streamlines interactions between patients, doctors, and hospital administrators. It combines a React frontend with a FastAPI + Gemini backend, and uses Sarvam SaaRAS V3 for multilingual speech and translation.

## Repository Structure

```
mediagent/               ← repo root (this directory)
├── backend/             ← FastAPI Python backend
│   ├── app/
│   │   ├── main.py      ← FastAPI app + all endpoints
│   │   ├── config.py    ← API keys loaded from backend/.env
│   │   ├── database.py  ← Supabase + local JSON fallback DB
│   │   └── services/    ← Patient Agent, Consultation Agent, EHR Agent, LLM/Sarvam
│   ├── .env             ← GEMINI_API_KEY, SARVAM_API_KEY, SUPABASE_*
│   └── requirements.txt
├── src/                 ← React frontend (TanStack Router)
│   ├── routes/          ← All pages (patient, doctor, admin)
│   └── lib/api/client.ts ← API client for backend communication
├── .env                 ← Frontend env (VITE_API_BASE_URL, VITE_SUPABASE_*)
└── package.json
```

## Features

### 👨‍⚕️ Doctor Portal
- **Dashboard & Queue**: Real-time AI-prioritised patient waitlist fetched from backend.
- **AI-Assisted Consultations**: Review AI-generated Pre-Consultation Summaries with ESI severity, differential diagnoses, and symptom timeline.
- **Voice Transcription**: Record doctor-patient dialogue — Sarvam STT + Gemini extract clinical facts automatically.
- **EHR Finalisation**: Approve AI fields, run drug safety audit, generate bilingual discharge summary, and export PDF.

### 🩺 Patient Portal
- **Pre-Consultation Flow**: Describe symptoms via text or voice (Telugu/Hindi/English). Sarvam handles STT and translation — the AI only sees English.
- **Pre-Consultation Report**: ESI triage score, differential diagnoses, temporary health guidance, TTS audio playback.
- **Treatments & Timeline**: Chronological EHR timeline pulled live from the backend.

### 🛠️ Admin Portal
- Platform analytics, AI model configuration, RBAC user management, and comprehensive audit logs.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TanStack Router |
| UI | Tailwind CSS v4, shadcn/ui, Lucide React |
| Backend | FastAPI, Python 3.11+ |
| AI | Google Gemini 2.5 Flash |
| Speech & Translation | Sarvam SaaRAS V3 (STT + TTS + Translation) |
| Database | Supabase (PostgreSQL) with local JSON fallback |

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 (with npm)
- **Python** ≥ 3.11
- API keys in `backend/.env` (see below)

### 1. Install frontend dependencies

```bash
# From the mediagent/ directory
npm install --legacy-peer-deps
```

### 2. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

### 3. Configure environment variables

**`backend/.env`** (backend API keys):
```env
GEMINI_API_KEY=your_gemini_key
SARVAM_API_KEY=your_sarvam_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
```

**`.env`** (frontend, already configured):
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 4. Start both frontend and backend together

```bash
npm start
```

This runs `concurrently`:
- **FRONTEND** → Vite dev server at `http://localhost:5173`
- **BACKEND** → uvicorn FastAPI at `http://127.0.0.1:8000`

### Run separately (if needed)

```bash
# Frontend only
npm run dev

# Backend only
npm run dev:backend
# or manually:
cd backend && uvicorn app.main:app --reload
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/patients` | List all patients sorted by ESI severity |
| `GET` | `/api/patients/{id}/timeline` | Patient EHR timeline |
| `POST` | `/api/intake` | Text-based patient intake (Patient Agent) |
| `POST` | `/api/intake-audio` | Audio-based patient intake |
| `POST` | `/api/consult/start` | Mark consultation as started |
| `POST` | `/api/consult/transcribe-extract` | Transcribe + extract clinical facts from audio |
| `POST` | `/api/consult/approve` | Finalize EHR with doctor edits (EHR Agent) |

## CORS

The backend allows all origins (`*`) so the Vite dev server at `:5173` can reach it freely. Restrict this before any public deployment.