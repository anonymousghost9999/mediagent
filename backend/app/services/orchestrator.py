import app.database as db
import app.services.patient_agent as patient_agent
import app.services.consultation_agent as consultation_agent
import app.services.ehr_agent as ehr_agent

def orchestrate_patient_intake(
    patient_id: str,
    consultation_id: str = None,
    name: str = "",
    age: int = 0,
    gender: str = "",
    allergies: list = None,
    medical_history: str = "",
    input_type: str = "text",  # 'text', 'audio', 'image'
    input_data: bytes = b"",
    language: str = "english",
    mode: str = "chat"
) -> dict:
    """
    Step 1: Patient Opens App & Completes Intake.
    Saves patient basic profile, runs the Patient Agent, and appends intake data to timeline.
    """
    if allergies is None:
        allergies = []
    print(f"[Orchestrator] Starting Intake Stage for Patient ID: {patient_id}, Consultation ID: {consultation_id}")
    
    # Save the initial patient profile to the database
    patient_profile = db.save_patient({
        "id": patient_id,
        "name": name,
        "age": age,
        "gender": gender,
        "allergies": allergies,
        "medical_history": medical_history,
        "language": language,
        "status": "waiting"
    })
    
    # Call the Patient Agent
    intake_report = patient_agent.run_patient_intake(
        patient_id=patient_id,
        consultation_id=consultation_id,
        input_type=input_type,
        input_data=input_data,
        language=language,
        mode=mode
    )
    
    # Timeline event created by the Patient Agent is saved inside run_patient_intake
    return intake_report

def orchestrate_start_consultation(patient_id: str) -> dict:
    """
    Step 2: Doctor opens the case on dashboard and starts recording.
    The frontend sends the CONSULTATION ID (not patient profile ID).
    We try to update the consultation status and write a timeline event.
    Falls back gracefully if the record doesn't exist in the local DB.
    """
    print(f"[Orchestrator] Consultation Started by Doctor for Patient ID: {patient_id}")

    # The frontend sends consultation_id. Try to find the consultation row first.
    consult = db.get_consultation(patient_id)
    if consult:
        # patient_id field inside the consultation row holds the actual profile UUID
        actual_patient_id = consult.get("patient_id") or patient_id
        patient = db.get_patient(actual_patient_id)
    else:
        # Maybe a patient profile ID was passed — try direct lookup
        patient = db.get_patient(patient_id)
        actual_patient_id = patient_id

    # Update patient status if found
    if patient:
        patient["status"] = "in_consultation"
        db.save_patient(patient)

    # Always write a timeline event (best-effort)
    try:
        event = db.add_timeline_event(actual_patient_id, "consultation_started", {
            "status": "in_progress"
        })
    except Exception as e:
        print(f"[WARNING] Timeline event failed (non-blocking): {e}")
        event = {"status": "in_progress"}

    return {"status": "in_consultation", "timeline_event": event}

def orchestrate_dialogue_processing(patient_id: str, audio_data: bytes, is_text_notes: bool = False) -> dict:
    """
    Step 3: Doctor ends recording. Dialogue transcript is converted to structured clinical facts.
    The frontend may send a consultation_id as patient_id, so we resolve language from
    the consultation row first, then fall back to the patient profile.
    """
    print(f"[Orchestrator] Processing dialogue for Patient ID: {patient_id}")

    language = "english"

    # Try consultation lookup first (frontend sends consultation_id)
    consult = db.get_consultation(patient_id)
    if consult:
        actual_patient_id = consult.get("patient_id") or patient_id
        patient = db.get_patient(actual_patient_id)
    else:
        patient = db.get_patient(patient_id)

    if patient:
        language = patient.get("language", "english")

    # Call the Consultation Agent passing the resolved language
    consult_draft = consultation_agent.process_consultation(
        audio_data=audio_data,
        is_text_notes=is_text_notes,
        language=language
    )

    return consult_draft

def orchestrate_finalize_consultation(
    patient_id: str,
    patient_intake_output: dict,
    consultation_output: dict,
    doctor_edits: dict = None
) -> dict:
    """
    Step 4: Doctor reviews EHR draft, makes edits, and hits Approve.
    Invokes the EHR Agent to check safety, generate discharge docs/insurance details,
    persist finalized data, and compile the final shared timeline.
    """
    print(f"[Orchestrator] Finalizing Consultation for Patient ID: {patient_id}")

    # Resolve actual patient_id (frontend may send consultation_id)
    consult = db.get_consultation(patient_id)
    actual_patient_id = consult.get("patient_id") or patient_id if consult else patient_id

    # Fetch longitudinal record before calling EHR Agent
    existing_record = db.get_medical_record(actual_patient_id) or {}

    # Call the EHR Agent (Persists record, updates timeline, performs safety checks)
    final_ehr = ehr_agent.compile_and_persist_ehr(
        patient_id=patient_id,
        patient_intake_output=patient_intake_output,
        consultation_output=consultation_output,
        doctor_edits=doctor_edits,
        existing_record=existing_record,
    )

    return final_ehr
