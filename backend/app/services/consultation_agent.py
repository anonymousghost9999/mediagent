"""
========================================================================================
AGENT 2: AMBIENT CONSULTATION & CLINICAL FACT EXTRACTION AGENT
========================================================================================
Role in Architecture:
- Listens to the doctor-patient dialogue during a consultation (ambient audio or typed notes).
- Transcribes audio into verbatim natural language (supporting Indian regional languages).
- Translates non-English transcripts into canonical English for standard medical processing.
- Utilizes LLM clinical reasoning to filter non-clinical conversation/noise (greetings, jokes, small talk)
  and extract structured clinical facts:
    1. Symptoms discussed
    2. Provisional Diagnosis
    3. ICD-10 Diagnostic Codes
    4. Prescribed Medications (name, dosage, frequency, duration)
    5. Tests and Investigations (both ordered for future and performed bedside)
    6. Follow-up plan & condition-based triggers
- Emits a structured draft dictionary that pre-populates the Doctor's editable Internal Medicine (IM) report.
========================================================================================
"""

import app.services.llm_service as llm


def process_consultation(
    audio_data: bytes, 
    is_text_notes: bool = False, 
    language: str = "english"
) -> dict:
    """
    Executes the complete consultation processing pipeline:
    
    Parameters:
    -----------
    audio_data : bytes
        Raw audio byte stream recorded in the clinic, OR utf-8 encoded text if is_text_notes=True.
    is_text_notes : bool
        If True, audio_data is treated as typed text notes rather than acoustic speech.
    language : str
        Patient's preferred or spoken language (e.g., 'english', 'hindi', 'telugu').
        
    Returns:
    --------
    dict:
        Structured draft containing raw_transcript, english_transcript, symptoms, diagnosis,
        icd10_code, prescribed_drugs, tests_and_investigations, and follow_up.
    """
    print("[Consultation Agent] Processing consultation session...")
    
    # ----------------------------------------------------------------------------------
    # Step 1: Resolve Language to BCP-47 Code
    # Standardizes user language input (e.g., 'telugu' -> 'te-IN', 'hindi' -> 'hi-IN')
    # so that speech-to-text models can calibrate acoustic and phonetic models accurately.
    # ----------------------------------------------------------------------------------
    bcp47 = llm.map_language_to_bcp47(language)
    original_transcript = ""
    
    # ----------------------------------------------------------------------------------
    # Step 2: Speech-to-Text (STT) or Text Decoding
    # If the doctor typed notes, decode directly.
    # If live audio was recorded, route through Sarvam AI Saaras V3 Speech-to-Text API.
    # ----------------------------------------------------------------------------------
    if is_text_notes:
        original_transcript = audio_data.decode("utf-8", errors="ignore")
        print(f"[Consultation Agent] Processing notes in original script: {original_transcript[:100]}...")
    else:
        print(f"[Consultation Agent] Routing audio to Sarvam STT ({bcp47})...")
        original_transcript = llm.sarvam_stt(audio_data, bcp47)
        print(f"[Consultation Agent] Original Dialogue Transcript:\n{original_transcript}")
        
    # ----------------------------------------------------------------------------------
    # Step 3: Canonical English Translation
    # Medical LLMs perform entity extraction and ICD-10 coding with highest accuracy on 
    # standardized English terminology. If the dialogue is in a regional Indian language,
    # translate it with contextual medical preservation using Sarvam / Gemini.
    # ----------------------------------------------------------------------------------
    english_transcript = original_transcript
    if bcp47 != "en-IN":
        print(f"[Consultation Agent] Translating dialogue to English via Sarvam Translation...")
        english_transcript = llm.sarvam_translate(original_transcript, bcp47, "en-IN")
        print(f"[Consultation Agent] Normalized English Transcript:\n{english_transcript}")
        
    # ----------------------------------------------------------------------------------
    # Step 4: Clinical Entity Extraction & Noise Discrimination
    # Prompts the LLM (Gemini 2.5 Flash) with strict rules:
    # - Ignore pleasantries, family small talk, and unrelated chit-chat.
    # - Isolate symptoms, ICD-10, dosage frequencies, and tests.
    # ----------------------------------------------------------------------------------
    print("[Consultation Agent] Filtering noise and extracting clinical summary...")
    clinical_summary = llm.extract_medical_summary(english_transcript)
    
    # ----------------------------------------------------------------------------------
    # Step 5: Draft Synthesis for Human-in-the-Loop (HITL) Review
    # Assemble all extracted entities into a clean dictionary.
    # This payload is sent to the doctor's frontend workspace to pre-fill the IM Report Form.
    # ----------------------------------------------------------------------------------
    draft = {
        # Verbatim audit trail (both original dialect and English equivalent)
        "raw_transcript": original_transcript,
        "english_transcript": english_transcript,
        
        # Clinical entities
        "symptoms": clinical_summary.get("symptoms", []),
        "diagnosis": clinical_summary.get("diagnosis", "Undiagnosed"),
        "icd10_code": clinical_summary.get("icd10_code", "None"),
        "prescribed_drugs": clinical_summary.get("prescribed_drugs", []),
        "tests_and_investigations": clinical_summary.get(
            "tests_and_investigations",
            clinical_summary.get("tests_ordered", [])
        ),
        "follow_up": clinical_summary.get("follow_up", None),
    }

    n_tests = len(draft["tests_and_investigations"])
    print(f"[Consultation Agent] Clinical extraction complete. Diagnosis: {draft['diagnosis']}")
    print(f"[Consultation Agent] Tests captured: {n_tests} item(s)")
    
    return draft

