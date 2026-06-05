import app.database as db
import app.services.llm_service as llm

def compile_and_persist_ehr(
    patient_id: str,
    patient_intake_output: dict,
    consultation_output: dict,
    doctor_edits: dict = None
) -> dict:
    """
    Runs the EHR Agent pipeline:
    1. Collects inputs from Patient Agent (intake details) and Consultation Agent (dialog summary).
    2. Incorporates doctor reviews/edits.
    3. Triggers drug-drug and drug-allergy safety checks.
    4. Translates discharge summaries to the patient's preferred language.
    5. Pre-fills insurance pre-authorization details.
    6. Saves the finalized structured consultation to the DB.
    7. Updates patient status to 'completed'.
    8. Appends logs to the Shared EHR Timeline in the DB.
    """
    print(f"[EHR Agent] Creating structured Electronic Health Record for Patient: {patient_id}")
    
    # Get active patient record
    patient = db.get_patient(patient_id)
    if not patient:
        raise ValueError(f"Patient with ID {patient_id} does not exist.")

    # 1. Merge Consultation output with Doctor edits
    final_diagnosis = consultation_output.get("diagnosis", "Undiagnosed")
    final_icd10 = consultation_output.get("icd10_code", "None")
    final_meds = consultation_output.get("prescribed_drugs", [])
    final_symptoms = consultation_output.get("symptoms", [])
    transcript = consultation_output.get("raw_transcript", "")
    doctor_notes = ""

    if doctor_edits:
        print("[EHR Agent] Incorporating doctor manual edits...")
        final_diagnosis = doctor_edits.get("diagnosis", final_diagnosis)
        final_icd10 = doctor_edits.get("icd10_code", final_icd10)
        final_meds = doctor_edits.get("prescribed_drugs", final_meds)
        doctor_notes = doctor_edits.get("doctor_notes", "")

    # 2. Safety Audit
    print("[EHR Agent] Performing drug safety and allergy audit...")
    history = patient.get("medical_history", "")
    allergies = patient.get("allergies", [])
    safety_report = llm.evaluate_drug_safety(allergies, history, final_meds)
    
    # 3. Bilingual Discharge Summaries
    print(f"[EHR Agent] Compiling discharge summary in patient language: {patient['language']}")
    # Gather medical advice instructions
    advice_lines = []
    advice_lines.append(f"Diagnosis: {final_diagnosis}")
    advice_lines.append("Prescribed Medications:")
    for m in final_meds:
        advice_lines.append(f"- {m.get('name')} {m.get('dosage')} - {m.get('frequency')} for {m.get('duration')}")
    if doctor_notes:
        advice_lines.append(f"Doctor's Advice: {doctor_notes}")
        
    english_instructions = "\n".join(advice_lines)
    translated_instructions = llm.translate_discharge_summary(english_instructions, patient["language"])

    # 4. Pre-fill Insurance Pre-authorization
    print("[EHR Agent] Generating insurance pre-authorization form details...")
    insurance_preauth = {
        "patient_name": patient.get("name"),
        "patient_age": patient.get("age"),
        "diagnosis_description": final_diagnosis,
        "icd10_code": final_icd10,
        "clinical_justification": f"Patient presents with {', '.join(final_symptoms)}. History of: {history or 'None'}. Confirmed by consultation.",
        "proposed_treatment": [f"{m.get('name')} ({m.get('dosage')})" for m in final_meds],
        "preauth_status": "Ready for submission"
    }

    # 5. Persist to DB (Storing both original language and English representations)
    print("[EHR Agent] Writing records to DB (persisting bilingual assets for search and auditing)...")
    consultation_record = db.save_consultation({
        "patient_id": patient_id,
        "symptoms": final_symptoms,
        "diagnosis": final_diagnosis,
        "icd10_code": final_icd10,
        "transcript": consultation_output.get("raw_transcript", ""),  # Original transcript
        "medications": final_meds,
        "doctor_notes": doctor_notes,
        # Multi-language audit columns
        "original_language": patient_intake_output.get("original_language", "en-IN"),
        "intake_original_transcript": patient_intake_output.get("original_transcript", ""),
        "intake_english_translation": patient_intake_output.get("english_translation", ""),
        "consult_original_transcript": consultation_output.get("raw_transcript", ""),
        "consult_english_transcript": consultation_output.get("english_transcript", "")
    })

    # Update patient status
    patient["status"] = "completed"
    db.save_patient(patient)

    # 6. Append events to Shared EHR Timeline
    print("[EHR Agent] Appending events to Shared EHR Timeline...")
    # Triage event
    db.add_timeline_event(patient_id, "intake", {
        "symptoms": patient_intake_output.get("english_translation", ""),
        "severity_score": patient_intake_output.get("severity_score"),
        "rationale": patient_intake_output.get("triage_rationale"),
        "organ_system": patient_intake_output.get("organ_system")
    })
    
    # Consultation finalized event
    db.add_timeline_event(patient_id, "consultation_finalized", {
        "consultation_id": consultation_record["id"],
        "diagnosis": final_diagnosis,
        "icd10_code": final_icd10,
        "prescriptions_count": len(final_meds)
    })
    
    # Safety check event
    if safety_report.get("has_conflict"):
        db.add_timeline_event(patient_id, "safety_alert", {
            "severity": safety_report.get("severity"),
            "description": safety_report.get("description")
        })

    # 7. Package final EHR output
    final_ehr = {
        "patient": patient,
        "consultation": consultation_record,
        "safety_audit": safety_report,
        "translated_discharge": translated_instructions,
        "insurance_preauth": insurance_preauth,
        "timeline": db.get_timeline(patient_id)
    }
    
    print(f"[EHR Agent] EHR compilation and DB save successful.")
    return final_ehr
