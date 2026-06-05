import app.database as db
import app.services.llm_service as llm

def run_patient_intake(
    patient_id: str,
    input_type: str,
    input_data: bytes,
    language: str = "english",
    mode: str = "chat"
) -> dict:
    """
    Runs the Patient Agent intake pipeline:
    1. Fetches patient profile and medical history.
    2. Processes symptom inputs (Text, Audio transcription, or Image OCR).
    3. Prompts LLM to clinically evaluate presenting symptoms + history.
    4. Reasons like a doctor (differential diagnoses, ESI scoring, temporary guidance).
    5. Saves updated triage data to the database.
    """
    print(f"[Patient Agent] Initializing intake session for Patient: {patient_id} in mode: {mode}")
    
    # 1. Fetch patient profile
    patient = db.get_patient(patient_id)
    if not patient:
        # Create a default patient profile if it doesn't exist
        patient = db.save_patient({
            "id": patient_id,
            "name": f"Patient_{patient_id[:6]}",
            "age": 45,
            "gender": "Male",
            "language": language,
            "status": "waiting"
        })
    
    # Compile history
    history = patient.get("medical_history", "")
    allergies = patient.get("allergies", [])
    past_consults = db.get_consultations(patient_id)
    
    if past_consults:
        history_parts = []
        if history:
            history_parts.append(f"Declared History: {history}")
        for c in past_consults:
            history_parts.append(
                f"Consult on {c.get('created_at', '')[:10]} - Diagnosis: {c.get('diagnosis')}. "
                f"Meds Prescribed: {', '.join([m.get('name') for m in c.get('medications', [])])}"
            )
        history = "; ".join(history_parts)
    else:
        history = history or "No prior clinical history on file."
        
    if allergies:
        history += f" (Allergies: {', '.join(allergies)})"

    # 2. BCP-47 Language Mapping
    bcp47 = llm.map_language_to_bcp47(language)
    print(f"[Patient Agent] Patient BCP-47 language resolved to: {bcp47}")

    # 3. Parse input content (capturing Original Transcript)
    original_transcript = ""
    if input_type == "audio":
        print(f"[Patient Agent] Routing voice to Sarvam STT ({bcp47})...")
        original_transcript = llm.sarvam_stt(input_data, bcp47)
        print(f"[Patient Agent] Original Transcript: {original_transcript}")
    elif input_type == "image":
        print("[Patient Agent] Processing uploaded scan/prescription image via OCR...")
        ocr_meta = llm.parse_image_input(input_data)
        original_transcript = ocr_meta
        print(f"[Patient Agent] Extracted OCR: {ocr_meta[:100]}...")
    else:
        # Text input
        original_transcript = input_data.decode("utf-8", errors="ignore")
        print(f"[Patient Agent] Text input received: {original_transcript}")

    # 4. Normalizing input transcript to English
    english_translation = original_transcript
    if bcp47 != "en-IN":
        print(f"[Patient Agent] Translating intake to English via Sarvam Translation...")
        english_translation = llm.sarvam_translate(original_transcript, bcp47, "en-IN")
        print(f"[Patient Agent] English Translation: {english_translation}")

    # Reconstruct previous conversation turns from the timeline to pass to the LLM
    chat_history = []
    events = db.get_timeline(patient_id)
    for event in events:
        if event.get("event_type") == "intake_chat_message":
            details = event.get("details", {})
            role = details.get("role")
            text = details.get("text")
            chat_history.append(f"{role.capitalize()}: {text}")

    # Add the current user turn to the timeline and history
    db.add_timeline_event(patient_id, "intake_chat_message", {"role": "patient", "text": english_translation})
    chat_history.append(f"Patient: {english_translation}")
    conversation_context = "\n".join(chat_history)

    # 5. Perform Clinical Reasoning (Agent receives English conversation context)
    print("[Patient Agent] Analyzing symptoms and clinical history...")
    clinical_analysis = llm.analyze_symptoms_and_history(conversation_context, history, "english")
    health_guidance_english = clinical_analysis.get("health_guidance", "Please await doctor consultation.")

    # Save the assistant response to the timeline
    db.add_timeline_event(patient_id, "intake_chat_message", {"role": "assistant", "text": health_guidance_english})

    # 6. Translate response back to Patient's native language
    health_guidance_translated = health_guidance_english
    if bcp47 != "en-IN":
        print(f"[Patient Agent] Translating guidance back to {bcp47} via Sarvam...")
        health_guidance_translated = llm.sarvam_translate(health_guidance_english, "en-IN", bcp47)
        print(f"[Patient Agent] Translated Guidance: {health_guidance_translated}")

    # 7. Convert translated response to Speech via Sarvam TTS (only if in voice mode)
    if mode == "voice":
        print(f"[Patient Agent] Converting guidance to speech via Sarvam TTS ({bcp47})...")
        agent_audio_base64 = llm.sarvam_tts(health_guidance_translated, bcp47)
    else:
        print("[Patient Agent] Chat mode selected. Skipping Sarvam TTS speech conversion.")
        agent_audio_base64 = ""

    # 8. Save triage data to Patient Profile in DB
    patient["severity_score"] = clinical_analysis.get("severity_score", 3)
    patient["status"] = "waiting"
    db.save_patient(patient)
    
    # Compile output report (preserving original, translated, and newly extracted fields)
    report = {
        "patient_id": patient_id,
        "original_language": bcp47,
        "original_transcript": original_transcript,
        "english_translation": english_translation,
        "agent_response_english": health_guidance_english,
        "agent_response_translated": health_guidance_translated,
        "agent_response_audio": agent_audio_base64,
        "differential_diagnoses": clinical_analysis.get("differential_diagnoses", []),
        "severity_score": clinical_analysis.get("severity_score", 3),
        "triage_rationale": clinical_analysis.get("triage_rationale", "No triage rationale provided."),
        "organ_system": clinical_analysis.get("organ_system", "Unknown"),
        "primary_issue": clinical_analysis.get("primary_issue", ""),
        "symptoms": clinical_analysis.get("symptoms", []),
        "duration": clinical_analysis.get("duration", ""),
        "previous_medication": clinical_analysis.get("previous_medication", ""),
        "allergies": clinical_analysis.get("allergies", ""),
        "chronic_diseases": clinical_analysis.get("chronic_diseases", ""),
        "is_intake_complete": clinical_analysis.get("is_intake_complete", False)
    }
    
    print(f"[Patient Agent] Intake complete. Triage Severity: {report['severity_score']} ({report['organ_system']})")
    return report
