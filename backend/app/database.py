import os
import json
import uuid
import pathlib
from datetime import datetime
from app.config import SUPABASE_URL, SUPABASE_KEY

# Local JSON database path — anchored to the backend root so it works
# regardless of which directory uvicorn / the test runner is started from.
LOCAL_DB_FILE = str(pathlib.Path(__file__).parent.parent / "db_fallback.json")

def _load_local_db():
    if not os.path.exists(LOCAL_DB_FILE):
        return {"patients": {}, "consultations": {}, "timelines": {}}
    try:
        with open(LOCAL_DB_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"patients": {}, "consultations": {}, "timelines": {}}

def _save_local_db(data):
    with open(LOCAL_DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# Initialize Supabase client if keys are available
supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[INFO] Database running in SUPABASE mode.")
    except Exception as e:
        print(f"[WARNING] Failed to initialize Supabase client: {e}. Falling back to LOCAL mode.")
else:
    print("[INFO] Database running in LOCAL JSON mode.")
def save_patient(patient_data: dict) -> dict:
    """
    Saves a patient record. In Supabase mode, this writes to the profiles table.
    """
    p_id = patient_data.get("id") or str(uuid.uuid4())
    now_str = datetime.utcnow().isoformat()
    
    # Check if p_id is a valid UUID, if not generate one or leave it to fallback
    is_valid_uuid = True
    try:
        uuid.UUID(str(p_id))
    except ValueError:
        is_valid_uuid = False

    if supabase_client and is_valid_uuid:
        try:
            # Map to profiles table schema
            record = {
                "id": p_id,
                "full_name": patient_data.get("name", "Unknown Patient"),
                "gender": patient_data.get("gender", "Other"),
                "preferred_language": patient_data.get("language", "english"),
                "allergies": patient_data.get("allergies", []),
                "role": "patient",
                "updated_at": now_str
            }
            # Add medical history as chronic_conditions if present
            med_hist = patient_data.get("medical_history", "")
            if med_hist:
                record["chronic_conditions"] = [med_hist]

            existing = supabase_client.table("profiles").select("*").eq("id", p_id).execute()
            if existing.data:
                upd_record = {
                    "full_name": record["full_name"],
                    "gender": record["gender"],
                    "preferred_language": record["preferred_language"],
                    "allergies": record["allergies"],
                    "updated_at": now_str
                }
                if "chronic_conditions" in record:
                    upd_record["chronic_conditions"] = record["chronic_conditions"]
                res = supabase_client.table("profiles").update(upd_record).eq("id", p_id).execute()
            else:
                record["email"] = f"patient_{p_id[:8]}@mediagent.com"
                res = supabase_client.table("profiles").upsert(record).execute()
                
            if res.data:
                ret = res.data[0]
                return {
                    "id": ret.get("id"),
                    "name": ret.get("full_name"),
                    "gender": ret.get("gender"),
                    "language": ret.get("preferred_language"),
                    "allergies": ret.get("allergies", []),
                    "medical_history": ", ".join(ret.get("chronic_conditions") or []),
                    "severity_score": patient_data.get("severity_score", 1),
                    "status": patient_data.get("status", "waiting"),
                    "created_at": ret.get("created_at")
                }
        except Exception as e:
            print(f"[ERROR] Supabase save_patient failed: {e}. Saving locally.")
            
    # Local JSON fallback
    db = _load_local_db()
    record = {
        "id": p_id,
        "name": patient_data.get("name", "Unknown Patient"),
        "age": patient_data.get("age", 0),
        "gender": patient_data.get("gender", "Other"),
        "language": patient_data.get("language", "english"),
        "severity_score": patient_data.get("severity_score", 1),
        "status": patient_data.get("status", "waiting"),
        "allergies": patient_data.get("allergies", []),
        "medical_history": patient_data.get("medical_history", ""),
        "created_at": patient_data.get("created_at") or now_str
    }
    db["patients"][p_id] = record
    _save_local_db(db)
    return record

def get_patient(patient_id: str) -> dict:
    """
    Retrieves a patient by ID.
    """
    is_valid_uuid = True
    try:
        uuid.UUID(str(patient_id))
    except ValueError:
        is_valid_uuid = False

    if supabase_client and is_valid_uuid:
        try:
            res = supabase_client.table("profiles").select("*").eq("id", patient_id).execute()
            if res.data:
                profile = res.data[0]
                return {
                    "id": profile.get("id"),
                    "name": profile.get("full_name"),
                    "gender": profile.get("gender"),
                    "language": profile.get("preferred_language"),
                    "allergies": profile.get("allergies") or [],
                    "medical_history": ", ".join(profile.get("chronic_conditions") or [])
                }
        except Exception as e:
            print(f"[ERROR] Supabase get_patient failed: {e}. Querying locally.")
            
    db = _load_local_db()
    return db["patients"].get(patient_id)

def list_patients() -> list:
    """
    Lists all patients, sorted by severity score descending, then created_at ascending.
    """
    if supabase_client:
        try:
            res = supabase_client.table("profiles").select("*").eq("role", "patient").execute()
            if res.data:
                try:
                    consults_res = supabase_client.table("consultations").select("patient_id, status, severity_score").execute()
                    consults_map = {c["patient_id"]: c for c in consults_res.data if c.get("patient_id")}
                except Exception:
                    consults_map = {}
                
                patients = []
                for p in res.data:
                    c = consults_map.get(p["id"], {})
                    patients.append({
                        "id": p["id"],
                        "name": p["full_name"],
                        "gender": p["gender"],
                        "language": p["preferred_language"],
                        "allergies": p["allergies"] or [],
                        "status": c.get("status", "waiting"),
                        "severity_score": c.get("severity_score", 1),
                        "created_at": p["created_at"]
                    })
                patients.sort(key=lambda x: (-x.get("severity_score", 1), x.get("created_at", "")))
                return patients
        except Exception as e:
            print(f"[ERROR] Supabase list_patients failed: {e}. Querying locally.")
            
    db = _load_local_db()
    patients = list(db["patients"].values())
    patients.sort(key=lambda x: (-x.get("severity_score", 1), x.get("created_at", "")))
    return patients

def save_consultation(consult_data: dict) -> dict:
    """
    Saves a consultation session record.
    """
    c_id = consult_data.get("id") or str(uuid.uuid4())
    now_str = datetime.utcnow().isoformat()
    
    record = {
        "id": c_id,
        "patient_id": consult_data.get("patient_id"),
        "status": consult_data.get("status", "drafting"),
        "severity_score": consult_data.get("severity_score", 3),
        "intake_summary": consult_data.get("intake_summary", ""),
        "chief_complaint": consult_data.get("chief_complaint", ""),
        "follow_up_recommendation": consult_data.get("follow_up_recommendation", ""),
        "symptoms": consult_data.get("symptoms", []),
        "diagnosis": consult_data.get("diagnosis", ""),
        "icd10_code": consult_data.get("icd10_code", ""),
        "transcript": consult_data.get("transcript", ""),
        "medications": consult_data.get("medications", []),
        "doctor_notes": consult_data.get("doctor_notes", ""),
        "created_at": consult_data.get("created_at") or now_str,
        # Multi-language audit columns
        "original_language": consult_data.get("original_language", "en-IN"),
        "intake_original_transcript": consult_data.get("intake_original_transcript", ""),
        "intake_english_translation": consult_data.get("intake_english_translation", ""),
        "consult_original_transcript": consult_data.get("consult_original_transcript", ""),
        "consult_english_transcript": consult_data.get("consult_english_transcript", "")
    }
    
    if supabase_client:
        try:
            res = supabase_client.table("consultations").upsert(record).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            print(f"[ERROR] Supabase save_consultation failed: {e}. Saving locally.")
            
    db = _load_local_db()
    db["consultations"][c_id] = record
    _save_local_db(db)
    return record

def get_consultation(consultation_id: str) -> dict:
    """
    Retrieves a consultation by its ID.
    """
    if supabase_client:
        try:
            res = supabase_client.table("consultations").select("*").eq("id", consultation_id).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            print(f"[ERROR] Supabase get_consultation failed: {e}. Querying locally.")
            
    db = _load_local_db()
    return db["consultations"].get(consultation_id)

def get_consultations(patient_id: str) -> list:
    """
    Gets consultation history for a specific patient.
    """
    if supabase_client:
        try:
            res = supabase_client.table("consultations").select("*").eq("patient_id", patient_id).execute()
            if res.data:
                return res.data
        except Exception as e:
            print(f"[ERROR] Supabase get_consultations failed: {e}. Querying locally.")
            
    db = _load_local_db()
    return [c for c in db["consultations"].values() if c.get("patient_id") == patient_id]

def add_timeline_event(patient_id: str, event_type: str, details: dict) -> dict:
    """
    Appends an event to the patient's EHR timeline.
    """
    event_id = str(uuid.uuid4())
    event = {
        "id": event_id,
        "patient_id": patient_id,
        "event_type": event_type,  # e.g., 'intake', 'consultation_start', 'safety_alert', 'approval'
        "timestamp": datetime.utcnow().isoformat(),
        "details": details
    }
    
    if supabase_client:
        try:
            res = supabase_client.table("timelines").insert(event).execute()
            if res.data:
                return res.data[0]
        except Exception as e:
            print(f"[ERROR] Supabase add_timeline_event failed: {e}. Saving locally.")
            
    db = _load_local_db()
    if patient_id not in db["timelines"]:
        db["timelines"][patient_id] = []
    db["timelines"][patient_id].append(event)
    _save_local_db(db)
    return event

def get_timeline(patient_id: str) -> list:
    """
    Fetches the full timeline for a patient.
    """
    if supabase_client:
        try:
            res = supabase_client.table("timelines").select("*").eq("patient_id", patient_id).execute()
            if res.data:
                events = res.data
                events.sort(key=lambda x: x.get("timestamp", ""))
                return events
        except Exception as e:
            print(f"[ERROR] Supabase get_timeline failed: {e}. Querying locally.")
            
    db = _load_local_db()
    events = db["timelines"].get(patient_id, [])
    events.sort(key=lambda x: x.get("timestamp", ""))
    return events

def clear_db():
    """
    Clears local database for clean test runs.
    """
    if os.path.exists(LOCAL_DB_FILE):
        try:
            os.remove(LOCAL_DB_FILE)
        except Exception:
            pass
