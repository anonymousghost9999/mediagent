"""
========================================================================================
CONFIGURATION & CREDENTIAL MANAGEMENT
========================================================================================
Role in Architecture:
- Centrally loads and validates environment variables and API keys from .env files.
- Credentials loaded:
    1. OPENROUTER_API_KEY: Foundation model access (Gemini 2.5 Flash for agent reasoning).
    2. SARVAM_API_KEY: Speech-to-Text (STT) and Text-to-Speech (TTS) for Indian languages.
    3. SUPABASE_URL & SUPABASE_KEY: Database connection credentials (PostgreSQL + RLS).
========================================================================================
"""

import os
import pathlib
from dotenv import load_dotenv

# Load .env file from the current working directory first (e.g. project root)
load_dotenv(override=True)

# Load the backend-specific .env file (backend/.env) if launched from repository root
backend_env_path = pathlib.Path(__file__).parent.parent / ".env"
if backend_env_path.exists():
    load_dotenv(dotenv_path=backend_env_path, override=True)

# Foundation Model API Key (OpenRouter)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

# Supabase PostgreSQL Database & Auth credentials
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

# Indian Speech & Translation API Key (Sarvam AI)
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")

# Diagnostic logging for environment health check
if not OPENROUTER_API_KEY:
    print("[WARNING] OPENROUTER_API_KEY is not set. Please set it in your environment or a .env file.")
if not SARVAM_API_KEY:
    print("[WARNING] SARVAM_API_KEY is not set. Running Sarvam in MOCK mode.")

