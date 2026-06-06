import os
import sys
import io

# Force UTF-8 encoding for stdout/stderr on Windows to prevent UnicodeEncodeError in print statements
if sys.platform.startswith('win'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

import app.database as db
import app.services.orchestrator as orch

app = FastAPI(
    title="MediAgent API",
    description="Agentic AI for Smarter Hospital Operations and EHR Management",
    version="1.0.0"
)

# Enable CORS for frontend integrations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define request models
class PatientIntakeRequest(BaseModel):
    patient_id: Optional[str] = None
    name: str
    age: int
    gender: str
    allergies: List[str] = []
    medical_history: str = ""
    symptom_text: str
    language: str = "english"
    mode: str = "chat"  # "chat" = text only, "voice" = STT/TTS enabled

class StartConsultationRequest(BaseModel):
    patient_id: str

class FinalizeConsultationRequest(BaseModel):
    patient_id: str
    patient_intake_output: Dict[str, Any]
    consultation_output: Dict[str, Any]
    doctor_edits: Optional[Dict[str, Any]] = None

class SessionSummaryRequest(BaseModel):
    transcript: str
    clinical_facts: Optional[Dict[str, Any]] = None

@app.get("/")
def read_root():
    return {"message": "Welcome to MediAgent Backend Agent Pipeline!"}

@app.get("/api/patients")
def get_patients_queue():
    """
    Get waiting patients sorted by triage severity.
    """
    return db.list_patients()

@app.get("/api/patients/{patient_id}/timeline")
def get_patient_timeline(patient_id: str):
    """
    Retrieve the Shared EHR Timeline for a patient.
    """
    return db.get_timeline(patient_id)

@app.post("/api/intake")
async def patient_intake(req: PatientIntakeRequest):
    """
    Step 1: Process Patient Intake Symptoms & History.
    Runs the Patient Agent, determines severity, differential diagnoses, and temporary advice.
    """
    try:
        # If no patient_id is passed, generate one
        import uuid
        p_id = req.patient_id or str(uuid.uuid4())
        
        report = orch.orchestrate_patient_intake(
            patient_id=p_id,
            name=req.name,
            age=req.age,
            gender=req.gender,
            allergies=req.allergies,
            medical_history=req.medical_history,
            input_type="text",
            input_data=req.symptom_text.encode("utf-8"),
            language=req.language,
            mode=req.mode
        )
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/intake-audio")
async def patient_intake_audio(
    name: str = Form(...),
    age: int = Form(...),
    gender: str = Form(...),
    allergies: str = Form("[]"),  # Expect JSON list string
    medical_history: str = Form(""),
    language: str = Form("english"),
    patient_id: Optional[str] = Form(None),
    audio_file: UploadFile = File(...)
):
    """
    Step 1 (Audio Variant): Processes audio symptom input via upload.
    """
    try:
        import uuid
        import json
        p_id = patient_id or str(uuid.uuid4())
        
        try:
            allergy_list = json.loads(allergies)
        except Exception:
            allergy_list = []
            
        audio_data = await audio_file.read()
        
        report = orch.orchestrate_patient_intake(
            patient_id=p_id,
            name=name,
            age=age,
            gender=gender,
            allergies=allergy_list,
            medical_history=medical_history,
            input_type="audio",
            input_data=audio_data,
            language=language,
            mode="voice"
        )
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/consult/start")
def start_consultation(req: StartConsultationRequest):
    """
    Step 2: Doctor explicitly triggers consultation starting.
    """
    try:
        res = orch.orchestrate_start_consultation(req.patient_id)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/consult/transcribe-extract")
async def transcribe_extract_dialogue(
    patient_id: str = Form(...),
    audio_file: UploadFile = File(...)
):
    """
    Step 3: Process the audio dialogue file recorded during consultation.
    Transcribes conversation, extracts medically relevant details, and filters small talk.
    """
    try:
        audio_data = await audio_file.read()
        draft = orch.orchestrate_dialogue_processing(
            patient_id=patient_id,
            audio_data=audio_data,
            is_text_notes=False
        )
        return draft
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/consult/text-extract")
def text_extract_notes(patient_id: str, notes: str):
    """
    Step 3 (Text Variant): Process manually typed notes or live speech transcript from the doctor.
    """
    try:
        draft = orch.orchestrate_dialogue_processing(
            patient_id=patient_id,
            audio_data=notes.encode("utf-8"),
            is_text_notes=True
        )
        return draft
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/consult/approve")
def approve_consultation(req: FinalizeConsultationRequest):
    """
    Step 4: Doctor reviews clinical summary, makes corrections, and approves.
    EHR Agent creates the finalized, maintainable EHR, safety audits meds, generates summaries,
    pre-fills insurance claims, and saves record to timeline.
    """
    try:
        result = orch.orchestrate_finalize_consultation(
            patient_id=req.patient_id,
            patient_intake_output=req.patient_intake_output,
            consultation_output=req.consultation_output,
            doctor_edits=req.doctor_edits
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/consult/session-summary")
def get_session_summary(req: SessionSummaryRequest):
    """
    Generates an AI-powered structured session summary from the consultation transcript.
    Returns: overview, key_findings, action_items, patient_instructions, risk_flags.
    """
    try:
        import app.services.llm_service as llm
        facts = req.clinical_facts or {}
        summary = llm.generate_session_summary(req.transcript, facts)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class HpiSummaryRequest(BaseModel):
    intake_report: Dict[str, Any]


@app.post("/api/consult/hpi-summary")
def generate_hpi(req: HpiSummaryRequest):
    """
    Generates a clinical History of Present Illness (HPI) paragraph from the
    patient agent's structured intake report JSON using an LLM.
    Returns: { "hpi": "<paragraph text>" }
    """
    try:
        import app.services.llm_service as llm
        hpi = llm.generate_hpi_summary(req.intake_report)
        return {"hpi": hpi}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
