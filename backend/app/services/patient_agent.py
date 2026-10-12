"""
========================================================================================
AGENT 1: PATIENT INTAKE, MULTILINGUAL ANAMNESIS & ESI TRIAGE AGENT
========================================================================================
Role in Architecture:
- First point of patient contact (accessible asynchronously via mobile or web portal).
- Ingests patient symptoms in text, speech (Sarvam STT), or prescription image/scan (OCR).
- Injects patient's longitudinal clinical history, known allergies, and past consultations.
- Handles cross-lingual communication: translates regional Indian languages (Hindi, Telugu)
  into canonical English for clinical reasoning, and translates responses back to the patient.
- Implements an adaptive 6-slot clinical history collection protocol:
    1. Primary issue / chief complaint
    2. Associated symptoms
    3. Duration of symptoms
    4. Previous medication or home remedies tried
    5. Known allergies
    6. Chronic diseases / comorbidities
- Performs physician-grade clinical reasoning:
    - Formulates differential diagnoses with probabilities.
    - Computes Emergency Severity Index (ESI Level 1 to 5) triage score.
    - Identifies affected organ system.
    - Emits conversational follow-up questions until intake is complete, then relief advice.
- Saves structured intake summaries and chat timeline events to the database.
========================================================================================
"""

import json
import app.database as db
import app.services.llm_service as llm


def run_patient_intake(
    patient_id: str,
    input_type: str,
    input_data: bytes,
    consultation_id: str = None,
    language: str = "english",
    mode: str = "chat"
) -> dict:
    """
    Executes the multi-turn Patient Intake and Triage workflow.

    Parameters:
    -----------
    patient_id : str
        Unique identifier of the patient profile.
    input_type : str
        Modality of input: 'text', 'audio' (voice note), or 'image' (OCR of prescription/lab).
    input_data : bytes
        Raw bytes of the input payload (audio buffer, image buffer, or UTF-8 text bytes).
    consultation_id : str, optional
        Unique ID of the active consultation encounter. If None, falls back to patient_id.
    language : str
        User's chosen language (e.g., 'english', 'hindi', 'telugu').
    mode : str
        Interaction mode: 'chat' (text-only responses) or 'voice' (synthesizes audio via TTS).

    Returns:
    --------
    dict:
        Comprehensive intake report including triage score, differential diagnoses,
        extracted clinical slots, and translated conversational guidance for the patient.
    """
    print(f"[Patient Agent] Initializing intake session for Patient: {patient_id} in mode: {mode}")
    
    # ----------------------------------------------------------------------------------
    # Step 1: Longitudinal Clinical Profile & Past Encounter Retrieval
    # Ensures the AI does not ask redundant questions already documented in the patient's record.
    # ----------------------------------------------------------------------------------
    patient = db.get_patient(patient_id)
    if not patient:
        # Create a default baseline patient record if this is an unauthenticated or first-time walk-in
        patient = db.save_patient({
            "id": patient_id,
            "name": f"Patient_{patient_id[:6]}",
            "age": 45,
            "gender": "Male",
            "language": language,
            "status": "waiting"
        })
    
    # Assemble prior clinical history and past consultation summaries
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

    # ----------------------------------------------------------------------------------
    # Step 2: Language Normalization (BCP-47 Mapping)
    # Maps user-facing language strings to formal BCP-47 identifiers (en-IN, hi-IN, te-IN)
    # required by speech recognition and translation endpoints.
    # ----------------------------------------------------------------------------------
    bcp47 = llm.map_language_to_bcp47(language)
    print(f"[Patient Agent] Patient BCP-47 language resolved to: {bcp47}")

    # ----------------------------------------------------------------------------------
    # Step 3: Multimodal Ingestion & Input Transcription
    # Decodes text, runs Sarvam Saaras V3 for voice audio, or performs vision OCR on scans.
    # ----------------------------------------------------------------------------------
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
        # Standard text input
        original_transcript = input_data.decode("utf-8", errors="ignore")
        print(f"[Patient Agent] Text input received: {original_transcript}")

    # ----------------------------------------------------------------------------------
    # Step 4: Medical-Context Translation to English
    # Regional language symptom statements (Telugu/Hindi) are translated to standard English.
    # We use LLM contextual medical translation to prevent loss of symptom severity nuance.
    # ----------------------------------------------------------------------------------
    english_translation = original_transcript
    if bcp47 != "en-IN":
        print(f"[Patient Agent] Translating intake to English via Sarvam Translation...")
        english_translation = llm.sarvam_translate(original_transcript, bcp47, "en-IN")
        print(f"[Patient Agent] English Translation: {english_translation}")

    # ----------------------------------------------------------------------------------
    # Step 5: Multi-Turn Conversation History Reconstruction
    # Replays prior turns from the patient timeline so the LLM remembers previous answers.
    # ----------------------------------------------------------------------------------
    chat_history = []
    events = db.get_timeline(patient_id)
    for event in events:
        if event.get("event_type") == "intake_chat_message":
            details = event.get("details", {})
            role = details.get("role")
            text = details.get("text")
            chat_history.append(f"{role.capitalize()}: {text}")

    # Append current turn to chat history and persist event to timeline
    db.add_timeline_event(patient_id, "intake_chat_message", {"role": "patient", "text": english_translation})
    chat_history.append(f"Patient: {english_translation}")
    conversation_context = "\n".join(chat_history)

    # ----------------------------------------------------------------------------------
    # Step 6: Clinical Reasoning & Adaptive Slot-Filling
    # Prompts Gemini 2.5 Flash with the full conversation context and longitudinal history:
    # - Extracts the 6 key anamnesis slots.
    # - Calculates Emergency Severity Index (ESI Level 1-5).
    # - Sets is_intake_complete to False if any of the 6 slots are missing, generating the next question.
    # - Sets is_intake_complete to True if all slots are grounded, providing comfort instructions.
    # ----------------------------------------------------------------------------------
    print("[Patient Agent] Analyzing symptoms and clinical history...")
    clinical_analysis = llm.analyze_symptoms_and_history(conversation_context, history, "english")
    health_guidance_english = clinical_analysis.get("health_guidance", "Please await doctor consultation.")

    # Save the agent's turn to timeline
    db.add_timeline_event(patient_id, "intake_chat_message", {"role": "assistant", "text": health_guidance_english})

    # ----------------------------------------------------------------------------------
    # Step 7: Localized Response Delivery (Translation + Speech)
    # Translates the advice back into the patient's native tongue (Hindi/Telugu).
    # If the user is in 'voice' mode, converts text to speech via Sarvam Bulbul V3 TTS.
    # ----------------------------------------------------------------------------------
    health_guidance_translated = health_guidance_english
    if bcp47 != "en-IN":
        print(f"[Patient Agent] Translating guidance back to {bcp47} via Sarvam...")
        health_guidance_translated = llm.sarvam_translate(health_guidance_english, "en-IN", bcp47)
        print(f"[Patient Agent] Translated Guidance: {health_guidance_translated}")

    if mode == "voice":
        print(f"[Patient Agent] Converting guidance to speech via Sarvam TTS ({bcp47})...")
        agent_audio_base64 = llm.sarvam_tts(health_guidance_translated, bcp47)
    else:
        print("[Patient Agent] Chat mode selected. Skipping Sarvam TTS speech conversion.")
        agent_audio_base64 = ""

    # ----------------------------------------------------------------------------------
    # Step 8: Database Synchronization & Consultation Queue Update
    # Updates the patient's severity score and creates/updates the consultation record
    # so the doctor's queue instantly reflects the new patient and urgency level.
    # ----------------------------------------------------------------------------------
    patient["severity_score"] = clinical_analysis.get("severity_score", 3)
    patient["status"] = "waiting"
    db.save_patient(patient)
    
    c_id = consultation_id or patient_id
    
    # Store complete structured intake JSON so Doctor Consultation Workspace can inspect it
    intake_summary_json = json.dumps({
        "primary_issue": clinical_analysis.get("primary_issue", ""),
        "english_symptoms": english_translation,
        "severity_score": clinical_analysis.get("severity_score", 3),
        "triage_rationale": clinical_analysis.get("triage_rationale", ""),
        "organ_system": clinical_analysis.get("organ_system", ""),
        "differential_diagnoses": clinical_analysis.get("differential_diagnoses", []),
        "symptoms": clinical_analysis.get("symptoms", []),
        "duration": clinical_analysis.get("duration", ""),
        "previous_medication": clinical_analysis.get("previous_medication", ""),
        "allergies": clinical_analysis.get("allergies", ""),
        "chronic_diseases": clinical_analysis.get("chronic_diseases", ""),
        "is_intake_complete": clinical_analysis.get("is_intake_complete", False),
        "health_guidance": health_guidance_english,
        "original_transcript": original_transcript,
    }, ensure_ascii=False)
    
    consult = db.get_consultation(c_id) or {}
    consult.update({
        "id": c_id,
        "patient_id": patient_id,
        "status": "waiting" if clinical_analysis.get("is_intake_complete") else consult.get("status", "drafting"),
        "severity_score": clinical_analysis.get("severity_score", 3),
        "chief_complaint": clinical_analysis.get("primary_issue") or english_translation,
        "intake_summary": intake_summary_json,
        "original_language": bcp47,
        "intake_original_transcript": original_transcript,
        "intake_english_translation": english_translation,
    })
    db.save_consultation(consult)
    
    # ----------------------------------------------------------------------------------
    # Step 9: Final Report Compilation
    # Emits full intake report returned to frontend / API client.
    # ----------------------------------------------------------------------------------
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
