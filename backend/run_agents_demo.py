import sys
import os
import time
import json

# Reconfigure stdout to support UTF-8 characters (Telugu/Hindi) on Windows terminals
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass # Fallback for older python versions

# Ensure python knows where to import 'app'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import app.database as db
import app.services.orchestrator as orch

# ANSI Color codes for beautiful console formatting
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

def print_header(title):
    print(f"\n{BOLD}{BLUE}{'='*60}\n{title.center(60)}\n{'='*60}{RESET}")

def print_sub_header(title):
    print(f"\n{BOLD}{YELLOW}--- {title} ---{RESET}")

def print_success(msg):
    print(f"{GREEN}✔ {msg}{RESET}")

def print_warning(msg):
    print(f"{RED}⚠ {msg}{RESET}")

def print_timeline(timeline):
    print_sub_header("Shared EHR Timeline")
    for event in timeline:
        ts = event["timestamp"][-12:-4]  # Format timestamp
        etype = event["event_type"].upper()
        details = event["details"]
        if etype == "INTAKE":
            print(f"[{ts}] {BOLD}PATIENT INTAKE:{RESET} Severity Score={details.get('severity_score')} | Organ={details.get('organ_system')}")
        elif etype == "CONSULTATION_STARTED":
            print(f"[{ts}] {BOLD}DOCTOR ENTERS ROOM:{RESET} Session initialized")
        elif etype == "CONSULTATION_FINALIZED":
            print(f"[{ts}] {BOLD}CONSULTATION COMPLETED:{RESET} Diagnosis: {details.get('diagnosis')} ({details.get('icd10_code')})")
        elif etype == "SAFETY_ALERT":
            print(f"[{ts}] {RED}{BOLD}CLINICAL SAFETY ALERT:{RESET} {details.get('severity').upper()} SEVERITY - {details.get('description')}")

def run_scenario_1():
    print_header("SCENARIO 1: EMERGENCY TRIAGE (Telugu Patient)")
    print("Patient enters the portal, selects Telugu, and uploads audio describing severe chest pain.")
    
    patient_id = "patient-cardiac-1"
    # Telugu audio description: "నాకు రెండు రోజుల నుండి తీవ్రమైన గుండెనొప్పి మరియు ఎడమ చేయి లాగుతోంది. చాలా భయంగా ఉంది."
    # We will simulate sending the raw bytes.
    telugu_symptoms = "నాకు రెండు రోజుల నుండి తీవ్రమైన గుండెనొప్పి మరియు ఎడమ చేయి లాగుతోంది. చాలా భయంగా ఉంది.".encode("utf-8")
    
    # 1. Start Patient Agent Intake
    print_sub_header("Invoking Patient Agent (Intake)")
    intake_report = orch.orchestrate_patient_intake(
        patient_id=patient_id,
        name="Ramesh Chawla",
        age=52,
        gender="Male",
        allergies=[],
        medical_history="Father passed away from sudden cardiac arrest.",
        input_type="text",  # Text input simulation
        input_data=telugu_symptoms,
        language="telugu"
    )
    
    print(f"{BOLD}Original Language BCP-47:{RESET} {intake_report['original_language']}")
    print(f"{BOLD}Original Transcript:{RESET} {intake_report['original_transcript']}")
    print(f"{BOLD}English Translation:{RESET} {intake_report['english_translation']}")
    print(f"{BOLD}Triage Severity Score:{RESET} {RED if intake_report['severity_score'] <= 2 else GREEN}{intake_report['severity_score']}{RESET} (Scale 1-5)")
    print(f"{BOLD}Triage Rationale:{RESET} {intake_report['triage_rationale']}")
    
    print_sub_header("Doctor-Like Differential Diagnoses Considered:")
    for d in intake_report["differential_diagnoses"]:
        print(f"- {BOLD}{d['condition']}{RESET} | Probability: {d['probability']} | {d['rationale']}")
        
    print_sub_header("Patient Guidance (English):")
    print(f"{YELLOW}{intake_report['agent_response_english']}{RESET}")
    print_sub_header("Patient Guidance (Translated):")
    print(f"{GREEN}{intake_report['agent_response_translated']}{RESET}")
    print_sub_header("Sarvam TTS Generated Audio:")
    audio_str = intake_report['agent_response_audio']
    print(f"Base64 Audio (first 30 chars): {audio_str[:30]}... [Size: {len(audio_str)} bytes]")
    print_success("Patient Agent Intake Complete & Saved to Shared DB.")

def run_scenario_2():
    print_header("SCENARIO 2: DRUG-DRUG INTERACTION WARNING")
    print("Patient has erectile dysfunction history and takes Sildenafil. Doctor attempts to prescribe Nitroglycerin.")
    
    patient_id = "patient-sildenafil-2"
    
    # 1. Patient Agent Intake
    orch.orchestrate_patient_intake(
        patient_id=patient_id,
        name="Somesh Rao",
        age=63,
        gender="Male",
        allergies=[],
        medical_history="Takes Sildenafil (Viagra) 50mg daily for erectile dysfunction.",
        input_type="text",
        input_data=b"I have been having some chest tightness when walking up stairs.",
        language="english"
    )
    
    # 2. Doctor starts Consultation
    orch.orchestrate_start_consultation(patient_id)
    
    # 3. Doctor/Patient dialogue (Audio transcript)
    # Doctor prescribes Nitroglycerin. We will simulate speech transcription output:
    dialogue = (
        "Doctor: Hello Somesh, I see you have some chest tightness. I'm going to prescribe you Nitroglycerin sublingual "
        "tablets. Take one under your tongue when you feel chest pain. Let's follow up next week.\n"
        "Patient: Thank you doctor, I will do that."
    ).encode("utf-8")
    
    print_sub_header("Invoking Consultation Agent (Dialogue Extraction)")
    consult_draft = orch.orchestrate_dialogue_processing(patient_id, dialogue, is_text_notes=True)
    print(f"Extracted Diagnosis: {consult_draft['diagnosis']}")
    print(f"Extracted Meds: {consult_draft['prescribed_drugs']}")
    
    # 4. EHR Agent compiles, checks conflicts, and persists
    print_sub_header("Invoking EHR Agent (Final Safety & DB Persistence)")
    final_ehr = orch.orchestrate_finalize_consultation(
        patient_id=patient_id,
        patient_intake_output={"english_translation": "Chest tightness", "severity_score": 3, "triage_rationale": "ESI-3", "organ_system": "Cardiac"},
        consultation_output=consult_draft
    )
    
    safety = final_ehr["safety_audit"]
    if safety["has_conflict"]:
        print_warning(f"DRUG INTERACTION FOUND: [{safety['severity']}] - {safety['description']}")
    else:
        print_success("No conflicts identified.")
        
    print_timeline(final_ehr["timeline"])

def run_scenario_3():
    print_header("SCENARIO 3: DRUG-ALLERGY WARNING")
    print("Patient has a known allergy to Penicillin. Doctor attempts to prescribe Amoxicillin.")
    
    patient_id = "patient-penicillin-3"
    
    # 1. Patient Agent Intake
    orch.orchestrate_patient_intake(
        patient_id=patient_id,
        name="Aditi Sharma",
        age=24,
        gender="Female",
        allergies=["Penicillin"],
        medical_history="Had severe hives and throat swelling after taking ampicillin as a child.",
        input_type="text",
        input_data=b"Severe sore throat, difficulty swallowing, running a fever.",
        language="english"
    )
    
    # 2. Doctor starts Consultation
    orch.orchestrate_start_consultation(patient_id)
    
    # 3. Consultation dialogue transcript
    dialogue = (
        "Doctor: Hello Aditi. Your throat looks quite inflamed, likely a strep infection.\n"
        "Patient: Yes, it hurts a lot.\n"
        "Doctor: I'm writing a prescription for Amoxicillin 500mg three times a day for 5 days. That should clear it up."
    ).encode("utf-8")
    
    print_sub_header("Invoking Consultation Agent")
    consult_draft = orch.orchestrate_dialogue_processing(patient_id, dialogue, is_text_notes=True)
    
    # 4. EHR Agent compiles, checks conflicts, and persists
    print_sub_header("Invoking EHR Agent")
    final_ehr = orch.orchestrate_finalize_consultation(
        patient_id=patient_id,
        patient_intake_output={"english_translation": "Sore throat and fever", "severity_score": 4, "triage_rationale": "ESI-4 pharyngitis", "organ_system": "ENT"},
        consultation_output=consult_draft
    )
    
    safety = final_ehr["safety_audit"]
    if safety["has_conflict"]:
        print_warning(f"ALLERGY WARNING FOUND: [{safety['severity']}] - {safety['description']}")
    else:
        print_success("No allergy conflicts found.")
        
    print_timeline(final_ehr["timeline"])

def run_scenario_4():
    print_header("SCENARIO 4: STANDARD CONSULTATION (Hindi Language Output)")
    print("Standard consultation with no conflicts. Generates localized discharge advice in Hindi.")
    
    patient_id = "patient-hindi-4"
    
    # 1. Patient Agent Intake in Hindi
    hindi_intake = "तीन दिनों से बुखार और बहुत तेज सिरदर्द है।".encode("utf-8")
    
    print_sub_header("Invoking Patient Agent (Intake)")
    intake_report = orch.orchestrate_patient_intake(
        patient_id=patient_id,
        name="Rajesh Gupta",
        age=37,
        gender="Male",
        allergies=[],
        medical_history="No prior chronic health conditions.",
        input_type="text",
        input_data=hindi_intake,
        language="hindi"
    )
    print(f"Translated Symptoms: {intake_report['english_translation']}")
    
    # 2. Doctor starts Consultation
    orch.orchestrate_start_consultation(patient_id)
    
    # 3. Doctor/Patient dialogue (simulated text)
    dialogue = (
        "Doctor: Hello Rajesh, I see you have had a fever and severe headache for 3 days.\n"
        "Patient: Yes, it is making it very hard to sleep.\n"
        "Doctor: Alright, I will prescribe Paracetamol 650mg twice daily for 5 days. Drink lots of fluids.\n"
        "Patient: Thank you, doctor."
    ).encode("utf-8")
    
    print_sub_header("Invoking Consultation Agent")
    consult_draft = orch.orchestrate_dialogue_processing(patient_id, dialogue, is_text_notes=True)
    
    # 4. EHR Agent compiles, safety audits, translates instructions, and persists
    print_sub_header("Invoking EHR Agent")
    final_ehr = orch.orchestrate_finalize_consultation(
        patient_id=patient_id,
        patient_intake_output=intake_report,
        consultation_output=consult_draft
    )
    
    print_success("EHR Record Saved.")
    print_sub_header("Translated Patient Discharge Summary (Hindi):")
    print(f"{GREEN}{final_ehr['translated_discharge']}{RESET}")
    
    print_sub_header("Pre-filled Insurance Pre-authorization Form Metadata:")
    print(json.dumps(final_ehr["insurance_preauth"], indent=2))
    
    print_timeline(final_ehr["timeline"])

if __name__ == "__main__":
    db.clear_db()  # Clear local fallback DB for clean run
    print_header("MediAgent AI Agents - End-to-End Simulation")
    print("This script demonstrates the interaction of the Orchestrator + 3 specialized Tool-Agents.")
    print("All tasks run via Gemini 2.5 Flash API calls (or mock fallbacks if keys are absent).\n")
    
    run_scenario_1()
    time.sleep(1)
    run_scenario_2()
    time.sleep(1)
    run_scenario_3()
    time.sleep(1)
    run_scenario_4()
    
    print_header("Simulation Complete. All DB mappings, timelines, and safety checks executed.")
