import app.services.llm_service as llm

def process_consultation(audio_data: bytes, is_text_notes: bool = False, language: str = "english") -> dict:
    """
    Runs the Consultation Agent pipeline:
    1. Resolves language BCP-47 script.
    2. Transcribes dialogue using Sarvam STT.
    3. Translates non-English transcript into English via Sarvam Translation.
    4. Extracts clinical facts using Gemini, ignoring small talk.
    5. Returns both original and English transcripts.
    """
    print("[Consultation Agent] Processing consultation session...")
    
    bcp47 = llm.map_language_to_bcp47(language)
    original_transcript = ""
    
    if is_text_notes:
        original_transcript = audio_data.decode("utf-8", errors="ignore")
        print(f"[Consultation Agent] Processing notes in original script: {original_transcript[:100]}...")
    else:
        print(f"[Consultation Agent] Routing audio to Sarvam STT ({bcp47})...")
        original_transcript = llm.sarvam_stt(audio_data, bcp47)
        print(f"[Consultation Agent] Original Dialogue Transcript:\n{original_transcript}")
        
    # Translate dialogue to English for canonical agent clinical processing
    english_transcript = original_transcript
    if bcp47 != "en-IN":
        print(f"[Consultation Agent] Translating dialogue to English via Sarvam Translation...")
        english_transcript = llm.sarvam_translate(original_transcript, bcp47, "en-IN")
        print(f"[Consultation Agent] Normalized English Transcript:\n{english_transcript}")
        
    print("[Consultation Agent] Filtering noise and extracting clinical summary...")
    clinical_summary = llm.extract_medical_summary(english_transcript)
    
    # Return structured draft
    draft = {
        "raw_transcript": original_transcript,
        "english_transcript": english_transcript,
        "symptoms": clinical_summary.get("symptoms", []),
        "diagnosis": clinical_summary.get("diagnosis", "Undiagnosed"),
        "icd10_code": clinical_summary.get("icd10_code", "None"),
        "prescribed_drugs": clinical_summary.get("prescribed_drugs", [])
    }
    
    print(f"[Consultation Agent] Clinical extraction complete. Diagnosis: {draft['diagnosis']}")
    return draft
