import app.database as db
import app.services.patient_agent as patient_agent
import app.services.consultation_agent as consultation_agent
import app.services.ehr_agent as ehr_agent

def orchestrate_patient_intake(
    patient_id: str,
    name: str,
    age: int,
    gender: str,
    allergies: list,
    medical_history: str,
    input_type: str,  # 'text', 'audio', 'image'
    input_data: bytes,
    language: str = "english",
    mode: str = "chat"
) -> dict:
    """
    Step 1: Patient Opens App & Completes Intake.
    Saves patient basic profile, runs the Patient Agent, and appends intake data to timeline.
    """
    print(f"[Orchestrator] Starting Intake Stage for Patient ID: {patient_id}")
    
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
    Updates state in DB to 'in_consultation' and writes timeline start marker.
    """
    print(f"[Orchestrator] Consultation Started by Doctor for Patient ID: {patient_id}")
    
    patient = db.get_patient(patient_id)
    if not patient:
        raise ValueError(f"Patient with ID {patient_id} does not exist.")
        
    patient["status"] = "in_consultation"
    db.save_patient(patient)
    
    event = db.add_timeline_event(patient_id, "consultation_started", {
        "status": "in_progress"
    })
    
    return {"status": "in_consultation", "timeline_event": event}

def orchestrate_dialogue_processing(patient_id: str, audio_data: bytes, is_text_notes: bool = False) -> dict:
    """
    Step 3: Doctor ends recording. Dialogue transcript is converted to structured clinical facts.
    """
    print(f"[Orchestrator] Processing dialogue for Patient ID: {patient_id}")
    
    # Fetch patient language from DB to guide speech recognition BCP-47 mapping
    language = "english"
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
    
    # Call the EHR Agent (Persists record, updates timeline, performs safety checks)
    final_ehr = ehr_agent.compile_and_persist_ehr(
        patient_id=patient_id,
        patient_intake_output=patient_intake_output,
        consultation_output=consultation_output,
        doctor_edits=doctor_edits
    )
    
    return final_ehr
