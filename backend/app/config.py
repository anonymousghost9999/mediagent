import os
import pathlib
from dotenv import load_dotenv

# Load .env file from the current working directory first
load_dotenv()

# Load the backend-specific .env file relative to this file to get keys if launched from root
backend_env_path = pathlib.Path(__file__).parent.parent / ".env"
if backend_env_path.exists():
    load_dotenv(dotenv_path=backend_env_path)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "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")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")

# Print warnings if keys are missing
if not OPENROUTER_API_KEY:
    print("[WARNING] OPENROUTER_API_KEY is not set. Please set it in your environment or a .env file.")
if not GROQ_API_KEY:
    print("[WARNING] GROQ_API_KEY is not set. Fallback LLM will not be available.")
if not SARVAM_API_KEY:
    print("[WARNING] SARVAM_API_KEY is not set. Running Sarvam in MOCK mode.")
