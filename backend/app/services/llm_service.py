import os
import json
import base64
from PIL import Image
import io
import httpx
from app.config import OPENROUTER_API_KEY, SARVAM_API_KEY

# Flag to check if we can use the live OpenRouter API (naming kept as use_live_gemini for backward compatibility)
use_live_gemini = False
if OPENROUTER_API_KEY:
    use_live_gemini = True
    print("[INFO] OpenRouter API configured successfully.")
else:
    print("[WARNING] No OPENROUTER_API_KEY provided.")

def map_language_to_bcp47(lang_str: str) -> str:
    """
    Maps general language strings to standard Sarvam BCP-47 codes.
    """
    l_val = lang_str.lower().strip()
    if "tel" in l_val or "te" in l_val:
        return "te-IN"
    if "hin" in l_val or "hi" in l_val:
        return "hi-IN"
    return "en-IN"

def call_openrouter(messages: list, max_tokens: int = 4000) -> str:
    """
    Helper to call the OpenRouter chat completions API using the google/gemini-2.5-flash model.
    """
    if not OPENROUTER_API_KEY:
        print("[ERROR] OpenRouter call failed: OPENROUTER_API_KEY is not set.")
        raise ValueError("OPENROUTER_API_KEY is not set. Please set it in your environment or a .env file.")
        
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8080",
        "X-Title": "MediAgent"
    }
    payload = {
        "model": "google/gemini-2.5-flash",
        "messages": messages,
        "max_tokens": max_tokens
    }
    
    print(f"[OpenRouter API] Sending completion request for model: {payload['model']} with max_tokens: {max_tokens}")
    response = httpx.post(url, headers=headers, json=payload, timeout=45.0)
    response.raise_for_status()
    res_json = response.json()
    
    choices = res_json.get("choices", [])
    if not choices:
        raise ValueError(f"OpenRouter API returned empty choices. Full response: {res_json}")
    return choices[0].get("message", {}).get("content", "").strip()

def sarvam_stt(audio_bytes: bytes, language_code: str = "en-IN") -> str:
    """
    Transcribes audio bytes using Sarvam SaaRAS V3 Speech-to-Text API.
    """
    if not SARVAM_API_KEY:
        print("[ERROR] Sarvam STT failed: SARVAM_API_KEY is not set.")
        raise ValueError("SARVAM_API_KEY is not set. Cannot run speech-to-text.")
        
    try:
        url = "https://api.sarvam.ai/speech-to-text"
        headers = {
            "api-subscription-key": SARVAM_API_KEY
        }
        files = {
            "file": ("recording.wav", audio_bytes, "audio/wav")
        }
        data = {
            "model": "saaras:v3",
            "language_code": language_code,
            "mode": "transcribe"
        }
        
        print(f"[Sarvam API] Sending Speech-to-Text request for language: {language_code}")
        response = httpx.post(url, headers=headers, files=files, data=data, timeout=30.0)
        response.raise_for_status()
        res_json = response.json()
        return res_json.get("transcript", "").strip()
    except Exception as e:
        print(f"[ERROR] Sarvam STT failed: {e}.")
        raise e

def sarvam_translate(text: str, source_lang: str, target_lang: str = "en-IN") -> str:
    """
    Translates text with high clinical fidelity using OpenRouter/Gemini to preserve medical context, 
    with graceful fallback to Sarvam Mayura Translation API on failure.
    """
    if not text:
        return ""
        
    source_bcp = map_language_to_bcp47(source_lang)
    target_bcp = map_language_to_bcp47(target_lang)
    
    if source_bcp == target_bcp:
        return text

    # Since blind machine translation can lose medical context and instructions,
    # we use the LLM with a structured medical translation prompt.
    prompt = f"""
You are an expert clinical translator fluent in English, Hindi (hi-IN), and Telugu (te-IN).
Translate the following medical text:
- Source Language: {source_bcp}
- Target Language: {target_bcp}

Text to translate:
\"\"\"
{text}
\"\"\"

Translation rules:
1. Do NOT perform a literal, blind word-for-word translation. Instead, preserve the exact medical context, clinical intent, and symptom severity.
2. Keep standard medical terminology, drug names, and dosages (e.g. Paracetamol, SpO2, Asthma) clear and readable in the target language. For Hindi or Telugu translations, use standard phonetic spellings or keep the English name in parentheses if it aids patient clarity.
3. Preserve the tone of the response (e.g. empathetic for patients, professional for doctors).
4. Output ONLY the final translated text. Do not include any notes, explanations, or wrapper markup.
"""
    try:
        print(f"[Translation] Translating contextually via LLM from {source_bcp} to {target_bcp}")
        messages = [{"role": "user", "content": prompt}]
        return call_openrouter(messages, max_tokens=2000)
    except Exception as e:
        print(f"[WARNING] Contextual LLM translation failed: {e}. Falling back to default Sarvam API translation.")
        if not SARVAM_API_KEY:
            raise e
        try:
            url = "https://api.sarvam.ai/translate"
            headers = {
                "api-subscription-key": SARVAM_API_KEY,
                "Content-Type": "application/json"
            }
            payload = {
                "input": text,
                "source_language_code": source_bcp,
                "target_language_code": target_bcp,
                "model": "mayura:v1"
            }
            
            print(f"[Sarvam API] Translating text from {source_bcp} to {target_bcp}")
            response = httpx.post(url, headers=headers, json=payload, timeout=30.0)
            response.raise_for_status()
            res_json = response.json()
            return res_json.get("translated_text", "").strip()
        except Exception as fallback_err:
            print(f"[ERROR] Sarvam fallback translation failed: {fallback_err}.")
            raise fallback_err


def sarvam_tts(text: str, target_language_code: str = "en-IN") -> str:
    """
    Converts text to speech using Sarvam Bulbul V3 TTS API. Returns base64 encoded audio string.
    """
    if not text:
        return ""
        
    target_bcp = map_language_to_bcp47(target_language_code)
    
    if not SARVAM_API_KEY:
        print("[ERROR] Sarvam TTS failed: SARVAM_API_KEY is not set.")
        raise ValueError("SARVAM_API_KEY is not set. Cannot run text-to-speech.")

    try:
        url = "https://api.sarvam.ai/text-to-speech"
        headers = {
            "api-subscription-key": SARVAM_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {
            "text": text,
            "target_language_code": target_bcp,
            "speaker": "shubh",
            "pace": 1.0,
            "model": "bulbul:v3"
        }
        
        print(f"[Sarvam API] Generating Text-to-Speech in language: {target_bcp}")
        response = httpx.post(url, headers=headers, json=payload, timeout=30.0)
        response.raise_for_status()
        res_json = response.json()
        audios = res_json.get("audios", [])
        return audios[0] if audios else ""
    except Exception as e:
        print(f"[ERROR] Sarvam TTS failed: {e}.")
        raise e

def transcribe_audio_to_text(audio_bytes: bytes, file_name: str = "recording.wav", language_code: str = "en-IN") -> str:
    """
    Decoupled transcription method. Uses Sarvam STT (Saaras V3) to transcribe audio.
    """
    bcp47 = map_language_to_bcp47(language_code)
    return sarvam_stt(audio_bytes, bcp47)

def parse_image_input(image_bytes: bytes) -> str:
    """
    Performs OCR and clinical reading on medical scans or handwritten prescriptions using Gemini 2.5 Flash via OpenRouter.
    """
    if not use_live_gemini:
        print("[ERROR] OpenRouter parse_image failed: OPENROUTER_API_KEY is not configured.")
        raise ValueError("OPENROUTER_API_KEY is not configured. Cannot parse image.")

    try:
        base64_image = base64.b64encode(image_bytes).decode("utf-8")
        prompt = (
            "Analyze this medical image (scanned report, clinical printout, or handwritten prescription). "
            "Perform OCR to extract all readable text. Provide a clear transcription of all patient metadata, "
            "diagnosis notes, lab results, and medications found in the image."
        )
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                ]
            }
        ]
        return call_openrouter(messages)
    except Exception as e:
        print(f"[ERROR] OpenRouter image analysis failed: {e}.")
        raise e

def parse_json_robust(text: str) -> dict:
    import re
    # Strip whitespace
    text = text.strip()
    
    # Remove markdown wrappers
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        if text.startswith("json"):
            text = text[4:].strip()
            
    # Find outer bounds of JSON object
    start_idx = text.find("{")
    end_idx = text.rfind("}")
    if start_idx != -1 and end_idx != -1:
        text = text[start_idx:end_idx+1]
        
    # Remove trailing commas before closing braces/brackets
    text = re.sub(r',\s*([\]}])', r'\1', text)
    
    try:
        return json.loads(text)
    except Exception as e:
        print(f"[parse_json_robust] First attempt failed: {e}. Trying to fix quotes.")
        # Attempt to fix single quotes to double quotes for keys/values
        # (Be very careful not to break valid double quotes)
        try:
            # Replace control characters/invalid spaces
            text_cleaned = re.sub(r'[\x00-\x1F\x7F]', '', text)
            return json.loads(text_cleaned)
        except Exception:
            raise e

def analyze_symptoms_and_history(symptoms_text: str, history_text: str, language: str) -> dict:
    """
    Intakes symptoms and history, reasons like a doctor (differential diagnoses), ESI severity (1-5), and relief instructions using OpenRouter.
    """
    prompt = f"""
You are an experienced clinical physician performing a patient intake evaluation.
Analyze the following patient presentation:
- Presenting Symptoms & Conversation History:
\"\"\"
{symptoms_text}
\"\"\"
- Patient Medical History (Already known/declared prior to this chat): "{history_text}"
- Language of interaction: "{language}"

Your primary objective is to collect the following patient intake details during the conversation:
1. Primary issue / chief complaint (Must be explicitly described by the patient)
2. Associated symptoms (Ask if they have any other symptoms accompanying the primary issue)
3. Duration (How long the issue has been present)
4. Previous medication or treatment used for this problem (Ask what they have tried for it)
5. Known allergies (Check history context first. If not found in history, ask the patient)
6. Chronic diseases or ongoing medical conditions (Check history context first. If not found in history, ask the patient)

Follow these interaction rules strictly:
- Check the Patient Medical History and the Conversation History to see what has already been discussed. Do NOT ask for information that is already provided in the history context or previous turns of the chat.
- Ask for any missing information naturally, asking ONE question at a time (e.g., first ask about duration, then after they reply ask about previous medications, etc.), instead of requesting everything at once.
- Do NOT pre-fill missing fields with default values like "unknown", "none", or "not sure" unless you have already asked the patient about that specific detail and they have responded with an uncertain, incomplete, or negative answer. If a detail has NOT been discussed/asked yet, its value should be left as "" (empty string) or empty list, and the intake is NOT complete.
- Set `is_intake_complete` to false if any of the 6 intake details are still missing/unresolved and have not yet been explicitly asked and answered in the conversation.
- Set `is_intake_complete` to true ONLY when all 6 details have been discussed and resolved (either with concrete answers, or because the patient answered "no", "not sure", or "unknown" after being asked), or if the patient explicitly indicates they have nothing more to add/say "ok" or "thanks" to conclude.
- Empathy & Tone: Maintain a conversational, empathetic tone without sounding like a rigid form.

Perform a clinical reasoning process:
1. Translate symptoms into English (if input is regional: Hindi/Telugu).
2. Consider the clinical details and formulate a differential diagnosis (minimum 3 possible conditions based on clinical likelihood, explaining your reasoning).
3. Compute a precise Severity Triage Score (1 to 5) using the Emergency Severity Index (ESI) protocol:
   - Level 1: Resuscitation (immediate life-saving intervention needed).
   - Level 2: Emergent / High Risk (high-risk situation, severe chest pain, extreme dyspnea).
   - Level 3: Urgent / Stable (stable vital signs, but requires multiple resources; e.g. severe pain).
   - Level 4: Less Urgent (stable, needs only a single resource).
   - Level 5: Non-urgent (stable, requires no active resources).
4. Outline your Clinical Triage Rationale.
5. Identify the primary Organ System involved (e.g. Cardiac, Respiratory, Gastrointestinal, Neurological, Musculoskeletal, etc.).
6. Formulate the `health_guidance`:
   - If `is_intake_complete` is false: Use `health_guidance` to ask the next follow-up question naturally to collect the missing information. Do NOT output final suggestions or relief instructions yet. Just ask the question.
   - If `is_intake_complete` is true: Use `health_guidance` to summarize the intake, thank the patient, provide clinical relief suggestions and guidance for temporary relief, and state that the pre-consultation report has been generated.

You MUST respond ONLY with a valid JSON object matching the following keys:
{{
  "english_symptoms": "Translated symptoms summary",
  "differential_diagnoses": [
    {{"condition": "Condition name", "probability": "High/Medium/Low", "rationale": "Clinical reason"}}
  ],
  "severity_score": 3,
  "triage_rationale": "Detailed reason based on ESI guidelines",
  "organ_system": "System name",
  "health_guidance": "Conversational response to the patient. Either the follow-up question (if is_intake_complete is false) OR the concluding relief suggestions and notice of report generation (if is_intake_complete is true).",
  "is_intake_complete": false,
  
  "primary_issue": "Extracted primary issue / chief complaint (or '' if not yet discussed)",
  "symptoms": ["List of extracted associated symptoms"],
  "duration": "Extracted duration of symptoms (or '' if not yet discussed)",
  "previous_medication": "Extracted previous medication/treatment used (or '' if not yet discussed)",
  "allergies": "Extracted known allergies (or '' if not yet discussed)",
  "chronic_diseases": "Extracted chronic diseases or ongoing conditions (or '' if not yet discussed)"
}}
Ensure the JSON is properly formatted, valid, and contains no code markdown blocks (like ```json).
"""
    if not use_live_gemini:
        print("[ERROR] OpenRouter analyze_symptoms failed: OPENROUTER_API_KEY is not configured.")
        raise ValueError("OPENROUTER_API_KEY is not configured. Cannot perform clinical symptom analysis.")

    try:
        messages = [{"role": "user", "content": prompt}]
        text = call_openrouter(messages)
        return parse_json_robust(text)
    except Exception as e:
        print(f"[ERROR] OpenRouter analyze_symptoms failed: {e}.")
        raise e



def extract_medical_summary(transcript_text: str) -> dict:
    """
    Extracts relevant clinical facts from doctor-patient dialog transcript, ignoring casual chitchat.
    Now also extracts tests ordered (with results) and follow-up plan.
    """
    prompt = f"""
You are a medical transcription summarizer. You will be given a transcript of a doctor-patient consultation.
Your task is to analyze the conversation, filter out all casual conversation, small talk, greetings, and jokes, and extract ONLY the medically relevant facts.

Transcript:
\"\"\"
{transcript_text}
\"\"\"

Extract the following information:
1. Symptoms discussed during the meeting.
2. Provisional Diagnosis.
3. Appropriate ICD-10 clinical code(s).
4. List of prescribed medications. For each medication, specify the drug name, dosage, frequency, and duration.
5. Tests and Investigations - capture ALL of the following that are mentioned in the transcript:
   a. Ordered tests: lab tests (blood, urine, culture, biopsy), imaging (X-ray, CT, MRI, ultrasound), ECG, spirometry, etc.
   b. Clinical investigations performed during the encounter: physical examination findings (auscultation findings, percussion, palpation results), vitals recorded (BP, SpO2, temperature, pulse), any bedside procedure performed or its result.
   For each item, specify: the name, the type ("ordered" for tests to be done later, or "performed" for investigations done during the visit), and the result/finding if mentioned. If no result was mentioned, leave result as an empty string.
6. Follow-up plan: When should the patient return, under what conditions (e.g. "Return in 1 week", "Come back immediately if fever >103\u00b0F", "Follow up in 3 days if no improvement"). If no follow-up was discussed, return null.

You MUST respond ONLY with a valid JSON object matching the following keys:
{{
  "symptoms": ["Symptom 1", "Symptom 2"],
  "diagnosis": "Provisional diagnosis text",
  "icd10_code": "ICD-10 code (e.g. J06.9)",
  "prescribed_drugs": [
    {{"name": "Drug Name", "dosage": "Dosage (e.g. 500mg)", "frequency": "Frequency (e.g. Twice daily)", "duration": "Duration (e.g. 5 days)"}}
  ],
  "tests_and_investigations": [
    {{"name": "Name (e.g. Complete Blood Count / Chest Auscultation / SpO2)", "type": "ordered" or "performed", "result": "Result or finding if mentioned (empty string if not discussed)"}}
  ],
  "follow_up": {{
    "timing": "When to return (e.g. '1 week', 'immediately if worsening')",
    "conditions": "Specific conditions/symptoms that warrant earlier return (or empty string if unconditional)",
    "instructions": "Any other follow-up instructions given to the patient"
  }}
}}
If no tests or investigations were mentioned, set "tests_and_investigations" to an empty list [].
If no follow-up was discussed, set "follow_up" to null.
Ensure the JSON is properly formatted and contains no markdown wrappers.
"""
    if not use_live_gemini:
        print("[ERROR] OpenRouter extract_medical_summary failed: OPENROUTER_API_KEY is not configured.")
        raise ValueError("OPENROUTER_API_KEY is not configured. Cannot extract medical summary from dialogue.")

    try:
        messages = [{"role": "user", "content": prompt}]
        text = call_openrouter(messages)
        return parse_json_robust(text)
    except Exception as e:
        print(f"[ERROR] OpenRouter extract_medical_summary failed: {e}.")
        raise e

def evaluate_drug_safety(
    allergies_list: list,
    history_text: str,
    prescribed_meds: list,
    allergy_records: list = None,
    current_medications: list = None
) -> dict:
    """
    Performs safety validation check on allergies and prior medication history.
    """
    allergy_records = allergy_records or []
    current_medications = current_medications or []

    prompt = f"""
You are an expert clinical pharmacist safety auditor.
Evaluate the safety of this prescription plan:
- Patient Known Allergies: {allergies_list}
- Medical History/Prior Meds: "{history_text}"
- Newly Prescribed Medications: {prescribed_meds}

LONGITUDINAL ALLERGY RECORDS (all known allergies, not just today's intake):
{allergy_records}

PATIENT'S CURRENT MEDICATIONS (already being taken before this visit):
{current_medications}

Perform a rigorous safety assessment:
1. Check for drug-allergy interactions (e.g., patient is allergic to Penicillin and is prescribed Amoxicillin/Penicillin-class drugs).
2. Check for drug-drug interactions between newly prescribed medications (e.g., co-administration of Nitroglycerin and Sildenafil causes dangerous blood pressure drop).
3. Check for interactions between new meds and prior history/past meds.
4. Check the newly prescribed medications against BOTH the longitudinal allergy records AND the current medications for drug-allergy conflicts and drug-drug interactions.

You MUST respond ONLY with a valid JSON object matching this structure:
{{
  "has_conflict": true/false,
  "severity": "None" / "Low" / "Medium" / "High",
  "description": "Clear clinical explanation of any conflicts or warnings found. If none, return 'No drug conflicts or allergy warnings identified.'"
}}
Ensure the JSON is properly formatted and contains no markdown wrappers.
"""
    if not use_live_gemini:
        print("[ERROR] OpenRouter evaluate_drug_safety failed: OPENROUTER_API_KEY is not configured.")
        raise ValueError("OPENROUTER_API_KEY is not configured. Cannot evaluate drug safety conflicts.")

    try:
        messages = [{"role": "user", "content": prompt}]
        text = call_openrouter(messages)
        return parse_json_robust(text)
    except Exception as e:
        print(f"[ERROR] OpenRouter evaluate_drug_safety failed: {e}.")
        raise e

def translate_discharge_summary(english_instructions: str, target_language: str) -> str:
    """
    Translates instructions to Hindi or Telugu using the Sarvam Translation API wrapper.
    """
    return sarvam_translate(english_instructions, "en-IN", target_language)

def generate_session_summary(transcript_text: str, clinical_facts: dict) -> dict:
    """
    Generates a structured session summary from the doctor-patient consultation.
    Returns a narrative overview plus structured sections: key_findings, action_items,
    patient_instructions, and risk_flags.
    """
    symptoms_str = ", ".join(clinical_facts.get("symptoms", [])) or "Not recorded"
    drugs_str = "; ".join(
        f"{d.get('name', '')} {d.get('dosage', '')} {d.get('frequency', '')} for {d.get('duration', '')}"
        for d in clinical_facts.get("prescribed_drugs", [])
    ) or "None"

    prompt = (
        "You are an expert clinical documentation AI. Based on the following consultation transcript and extracted clinical facts, "
        "generate a concise structured session summary.\n\n"
        f"Transcript:\n\"\"\"\n{transcript_text}\n\"\"\"\n\n"
        f"Extracted Clinical Facts:\n"
        f"- Symptoms: {symptoms_str}\n"
        f"- Provisional Diagnosis: {clinical_facts.get('diagnosis', 'Not established')}\n"
        f"- ICD-10 Code: {clinical_facts.get('icd10_code', 'Not coded')}\n"
        f"- Prescribed Medications: {drugs_str}\n\n"
        "Generate a structured session summary. Respond ONLY with valid JSON (no markdown) with these exact keys:\n"
        '{"overview": "2-3 sentence narrative summary", "key_findings": ["Finding 1", "Finding 2"], '
        '"action_items": ["Action 1"], "patient_instructions": ["Instruction 1"], "risk_flags": []}'
    )

    if not use_live_gemini:
        return {
            "overview": f"Patient presented with {symptoms_str}. Provisional diagnosis: {clinical_facts.get('diagnosis', 'Undiagnosed')}. Medications prescribed as documented.",
            "key_findings": [
                f"Chief complaint: {symptoms_str}",
                f"Diagnosis: {clinical_facts.get('diagnosis', 'Pending')}",
                f"ICD-10: {clinical_facts.get('icd10_code', 'Pending')}"
            ],
            "action_items": ["Review prescribed medications with patient", "Schedule follow-up appointment"],
            "patient_instructions": ["Take medications as directed", "Return if symptoms worsen", "Stay hydrated and rest"],
            "risk_flags": []
        }

    try:
        messages = [{"role": "user", "content": prompt}]
        text = call_openrouter(messages)
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            if text.startswith("json"):
                text = text[4:].strip()
        return json.loads(text)
    except Exception as e:
        print(f"[ERROR] generate_session_summary failed: {e}.")
        return {
            "overview": f"Consultation completed. Diagnosis: {clinical_facts.get('diagnosis', 'Pending')}.",
            "key_findings": [symptoms_str],
            "action_items": ["Review EHR and approve"],
            "patient_instructions": ["Follow prescribed treatment plan"],
            "risk_flags": []
        }

def generate_hpi_summary(intake_report: dict) -> str:
    """
    Generates a concise, clinical History of Present Illness (HPI) paragraph
    from the structured patient agent intake report JSON.
    Returns a single readable paragraph suitable for the IM report HPI field.
    """
    if not use_live_gemini:
        parts = []
        if intake_report.get("primary_issue"):
            parts.append("Patient presents with " + intake_report["primary_issue"] + ".")
        symptoms = intake_report.get("symptoms") or intake_report.get("identified_symptoms") or []
        if symptoms:
            parts.append("Reported symptoms include " + ", ".join(symptoms) + ".")
        if intake_report.get("duration"):
            parts.append("Duration: " + intake_report["duration"] + ".")
        return " ".join(parts) or "No history available."

    safe_report = {k: v for k, v in intake_report.items()
                   if k not in ("agent_response_audio", "agent_response_translated")
                   and not isinstance(v, bytes)}

    prompt = (
        "You are a clinical documentation assistant. Given the following structured patient intake report "
        "(collected by an AI patient agent), write a single concise paragraph of History of Present Illness (HPI) "
        "in standard clinical language.\n\n"
        "The HPI should cover: chief complaint, symptom onset and duration, character/severity, "
        "aggravating/relieving factors, associated symptoms, and relevant history. "
        "Be factual, use only information present in the report, and write in the third person "
        "(Patient reports...).\n\n"
        "Do NOT include diagnosis, prescriptions, or recommendations - only patient-reported history.\n"
        "Keep it under 120 words.\n\n"
        "Intake Report:\n"
        + json.dumps(safe_report, indent=2)
        + "\n\nRespond with ONLY the HPI paragraph text, no headings or labels."
    )

    try:
        hpi = call_openrouter(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300
        )
        print("[LLM] HPI summary generated (" + str(len(hpi)) + " chars)")
        return hpi.strip()
    except Exception as e:
        print("[ERROR] generate_hpi_summary failed: " + str(e))
        parts = []
        if intake_report.get("primary_issue"):
            parts.append("Patient reports " + intake_report["primary_issue"] + ".")
        symptoms = intake_report.get("symptoms") or []
        if symptoms:
            parts.append("Symptoms include " + ", ".join(symptoms) + ".")
        return " ".join(parts) or "History unavailable."
