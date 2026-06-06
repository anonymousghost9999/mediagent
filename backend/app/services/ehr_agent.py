import re
import copy
from datetime import datetime, timezone

import app.database as db
import app.services.llm_service as llm

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

ICD10_RE = re.compile(r"^[A-Z][0-9]{2}(\.[0-9]{1,4})?$")

_BLANK_RECORD = {
    "total_consultations": 0,
    "active_conditions": [],
    "allergy_records": [],
    "treatment_progress": [],   # stores visit_history entries
    "recent_developments": [],
    "medication_history": [],
    "current_medications": [],
}


def _validate_icd10(code: str) -> tuple:
    """Returns (code, is_valid). Invalid codes become 'PENDING_VALIDATION'."""
    if code and ICD10_RE.match(str(code).strip()):
        return str(code).strip(), True
    return "PENDING_VALIDATION", False


# ─────────────────────────────────────────────────────────────────────────────
# Main EHR Agent Entry Point
# ─────────────────────────────────────────────────────────────────────────────

def compile_and_persist_ehr(
    patient_id: str,
    patient_intake_output: dict,
    consultation_output: dict,
    doctor_edits: dict = None,
    existing_record: dict = None,
    **kwargs
) -> dict:
    """
    Compiles and persists a longitudinal EHR record.

    Data priority (high → low):
        1. doctor_edits (IM Report fields + Doctor Analysis) — always wins
        2. consultation_output (AI-extracted clinical facts)
        3. patient_intake_output (patient-reported symptoms and history)
    """
    print(f"[EHR Agent] Starting for: {patient_id}")
    today = datetime.now(timezone.utc).date().isoformat()
    now_ts = datetime.now(timezone.utc).isoformat()
    doc = doctor_edits or {}

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 0 — Resolve actual patient profile ID
    # (frontend sends consultation UUID as patient_id)
    # ─────────────────────────────────────────────────────────────────────────
    consult_row = db.get_consultation(patient_id)
    actual_patient_id = (
        consult_row.get("patient_id") or patient_id
        if consult_row else patient_id
    )
    print(f"[EHR Agent] Resolved patient_id: {actual_patient_id}")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 1 — Load existing longitudinal EHR (or create blank for new patient)
    # ─────────────────────────────────────────────────────────────────────────
    if existing_record is None:
        raw = db.get_medical_record(actual_patient_id)
        existing = copy.deepcopy(raw) if raw else {}
    else:
        existing = copy.deepcopy(existing_record) if existing_record else {}

    # Ensure all expected keys are present (safe migration from older records)
    for key, default in _BLANK_RECORD.items():
        existing.setdefault(key, copy.deepcopy(default))

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 2 — Resolve final field values (doctor wins over AI)
    # ─────────────────────────────────────────────────────────────────────────

    # Diagnosis — IM Report > AI extraction
    final_diagnosis = (
        doc.get("diagnosis") or
        consultation_output.get("diagnosis") or
        "Undiagnosed"
    ).strip()

    # ICD-10
    icd10_raw = (
        doc.get("icd10_code") or
        consultation_output.get("icd10_code") or ""
    )
    final_icd10, icd10_valid = _validate_icd10(icd10_raw)

    # Medications — IM Report > AI extraction
    final_meds = (
        doc.get("prescribed_drugs") or
        consultation_output.get("prescribed_drugs") or
        consultation_output.get("medications") or []
    )
    # Normalise meds to dicts
    final_meds = [
        {"name": m, "dosage": "", "frequency": "", "duration": "", "prescribed_at": today}
        if isinstance(m, str) else {**m, "prescribed_at": today}
        for m in final_meds
    ]

    # Symptoms — AI extraction > patient intake
    final_symptoms = (
        consultation_output.get("symptoms") or
        patient_intake_output.get("symptoms") or []
    )

    # Subjective fields
    chief_complaint = (
        doc.get("chief_complaint") or
        patient_intake_output.get("primary_issue") or
        patient_intake_output.get("english_translation") or ""
    )
    hpi          = doc.get("hpi") or ""
    onset        = doc.get("onset") or ""
    differential = doc.get("differential") or ""

    # Plan fields
    investigations   = doc.get("investigations") or consultation_output.get("tests_and_investigations") or []
    lifestyle_advice = doc.get("lifestyle_advice") or ""
    follow_up_raw    = doc.get("follow_up") or consultation_output.get("follow_up") or {}
    follow_up_timing = (
        follow_up_raw.get("timing", str(follow_up_raw))
        if isinstance(follow_up_raw, dict) else str(follow_up_raw)
    )

    # Doctor inputs
    treatment_status = doc.get("treatment_status") or "TREATMENT_ONGOING"
    doctor_analysis  = doc.get("analysis_text") or ""
    clinical_notes   = doc.get("clinical_notes") or ""

    # Objective vitals (doctor-filled in IM Report)
    objective = doc.get("objective") or {}

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 3 — Update longitudinal fields (always additive, never delete history)
    # ─────────────────────────────────────────────────────────────────────────
    existing["total_consultations"] += 1
    visit_number = existing["total_consultations"]

    # 3a. Active conditions
    conditions = existing["active_conditions"]
    for diag_name in [d.strip() for d in final_diagnosis.split(",") if d.strip()]:
        match = next(
            (c for c in conditions if c.get("name", "").lower() == diag_name.lower()), None
        )
        if match:
            match["last_seen"] = today
            match.setdefault("notes", []).append({
                "visit": visit_number,
                "date": today,
                "note": clinical_notes or f"Reviewed — {treatment_status}"
            })
        else:
            conditions.append({
                "name": diag_name,
                "icd10_code": final_icd10,
                "first_seen": today,
                "last_seen": today,
                "status": "active",
                "notes": [{"visit": visit_number, "date": today, "note": "Initial diagnosis"}]
            })

    # 3b. Allergy records (union-merge — never delete)
    allergy_records = existing["allergy_records"]
    raw_allergies = patient_intake_output.get("allergies") or []
    if isinstance(raw_allergies, str):
        raw_allergies = [a.strip() for a in raw_allergies.split(",") if a.strip()]
    for item in raw_allergies:
        allergen_name = item if isinstance(item, str) else item.get("allergen", "")
        if not allergen_name:
            continue
        existing_allergy = next(
            (a for a in allergy_records if a.get("allergen", "").lower() == allergen_name.lower()), None
        )
        if existing_allergy:
            existing_allergy["last_confirmed"] = today
        else:
            allergy_records.append({
                "allergen": allergen_name,
                "severity": "unknown",
                "first_reported": today,
                "last_confirmed": today
            })

    # 3c. Visit history entry (stored inside treatment_progress column)
    visit_entry = {
        "visit_number": visit_number,
        "date": today,
        # Subjective
        "chief_complaint": chief_complaint,
        "hpi": hpi,
        "onset": onset,
        "severity_score": patient_intake_output.get("severity_score", 3),
        "symptoms": final_symptoms,
        "differential_diagnoses": patient_intake_output.get("differential_diagnoses", []),
        # Objective
        "objective": objective,
        # Assessment
        "diagnosis": final_diagnosis,
        "icd10_code": final_icd10,
        "differential": differential,
        # Plan
        "investigations_ordered": investigations,
        "medications_prescribed": final_meds,
        "lifestyle_advice": lifestyle_advice,
        "follow_up": follow_up_timing,
        # Doctor inputs
        "treatment_status": treatment_status,
        "doctor_analysis": doctor_analysis,
        "clinical_notes": clinical_notes,
        # Transcript snippet
        "transcript_summary": (consultation_output.get("english_transcript") or "")[:500]
    }
    existing["treatment_progress"].append(visit_entry)

    # 3d. Recent developments (capped at 10)
    significance = (
        "critical" if any(
            w in final_diagnosis.lower()
            for w in ["cancer", "acute", "emergency", "failure", "critical", "severe"]
        )
        else ("notable" if investigations else "routine")
    )
    existing["recent_developments"].append({
        "date": today,
        "visit_number": visit_number,
        "development": (
            f"Visit {visit_number}: {final_diagnosis}."
            + (f" Advice: {lifestyle_advice[:80]}" if lifestyle_advice else "")
        ),
        "significance": significance
    })
    existing["recent_developments"] = existing["recent_developments"][-10:]

    # 3e. Medications — archive old, install new
    old_meds = copy.deepcopy(existing.get("current_medications", []))
    if old_meds:
        existing["medication_history"].append({
            "medications": old_meds,
            "archived_at": today,
            "visit_number": visit_number - 1
        })
    existing["medication_history"].append({
        "prescribed": final_meds,
        "visit_number": visit_number,
        "date": today
    })
    if final_meds:
        existing["current_medications"] = final_meds
    elif visit_number > 1:
        existing["current_medications"] = [{"name": "No current medications", "prescribed_at": today}]
    else:
        existing["current_medications"] = []

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 4 — Drug safety audit (non-blocking)
    # ─────────────────────────────────────────────────────────────────────────
    safety_audit = {
        "has_conflict": False,
        "severity": "unknown",
        "conflicts": "Drug safety check skipped",
        "checked_at": now_ts
    }
    try:
        allergy_name_list = [a.get("allergen", "") for a in allergy_records]
        history_text = (
            f"Current medications: {[m.get('name','') for m in old_meds] or 'None'}. "
            f"Medical history: {patient_intake_output.get('english_translation', '')}."
        )
        result = llm.evaluate_drug_safety(
            allergies_list=allergy_name_list,
            history_text=history_text,
            prescribed_meds=final_meds,
            allergy_records=allergy_records,
            current_medications=old_meds
        )
        safety_audit = {
            "has_conflict": result.get("has_conflict", False),
            "severity": result.get("severity", "None"),
            "conflicts": result.get("description", ""),
            "checked_at": now_ts
        }
        print(f"[EHR Agent] Drug safety: severity={safety_audit['severity']}, conflict={safety_audit['has_conflict']}")
    except Exception as e:
        print(f"[EHR Agent] Drug safety check non-blocking skip: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 5 — Bilingual discharge summary (non-blocking)
    # ─────────────────────────────────────────────────────────────────────────
    patient = db.get_patient(actual_patient_id) or db.get_patient(patient_id) or {
        "id": actual_patient_id, "language": "english", "name": "Unknown"
    }
    discharge_lines = [f"Diagnosis: {final_diagnosis} ({final_icd10})", "Medications:"]
    for m in final_meds:
        discharge_lines.append(f"  - {m.get('name','')} {m.get('dosage','')} {m.get('frequency','')}")
    if lifestyle_advice:
        discharge_lines.append(f"Advice: {lifestyle_advice}")
    if follow_up_timing:
        discharge_lines.append(f"Follow-up: {follow_up_timing}")
    english_discharge = "\n".join(discharge_lines)
    translated_discharge = english_discharge
    try:
        translated_discharge = llm.translate_discharge_summary(
            english_discharge, patient.get("language", "english")
        )
    except Exception as e:
        print(f"[EHR Agent] Discharge translation non-blocking skip: {e}")

    insurance_preauth = {
        "icd10_code": final_icd10,
        "icd10_valid": icd10_valid,
        "icd10_flag": None if icd10_valid else "ICD-10 code failed validation — PENDING_VALIDATION",
        "clinical_justification": (
            f"Patient presents with {', '.join(str(s) for s in final_symptoms) or chief_complaint}. "
            f"Diagnosis: {final_diagnosis}."
        ),
        "proposed_treatment": [f"{m.get('name','')} ({m.get('dosage','')})" for m in final_meds]
    }

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 6 — Persist to database
    # ─────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 6 — Persisting to DB...")
    consultation_record = db.save_consultation({
        "id": patient_id,
        "patient_id": actual_patient_id,
        "status": "completed",
        "approved_at": now_ts,
        "symptoms": final_symptoms,
        "diagnosis": final_diagnosis,
        "icd10_code": final_icd10,
        "transcript": consultation_output.get("raw_transcript", ""),
        "medications": final_meds,
        "doctor_notes": clinical_notes,
        "safety_audit": safety_audit,
        "original_language": patient_intake_output.get("original_language", "en-IN"),
        "intake_original_transcript": patient_intake_output.get("original_transcript", ""),
        "intake_english_translation": patient_intake_output.get("english_translation", ""),
        "consult_original_transcript": consultation_output.get("raw_transcript", ""),
        "consult_english_transcript": consultation_output.get("english_transcript", "")
    })

    try:
        db.upsert_medical_record(actual_patient_id, existing)
        print("[EHR Agent] Medical record upserted OK.")
    except Exception as e:
        print(f"[EHR Agent] WARNING: upsert_medical_record failed (consultation still saved): {e}")

    patient["status"] = "completed"
    db.save_patient(patient)

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 7 — Timeline events (all non-blocking)
    # ─────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 7 — Writing timeline events...")
    timeline_events = [
        ("intake", {
            "summary": chief_complaint,
            "severity_score": patient_intake_output.get("severity_score")
        }),
        ("consultation_finalized", {
            "summary": final_diagnosis,
            "icd10_code": final_icd10,
            "prescriptions_count": len(final_meds)
        }),
        (
            "safety_alert" if safety_audit.get("has_conflict") else "safety_clear",
            {"severity": safety_audit.get("severity"), "conflicts": safety_audit.get("conflicts", "")}
        ),
        ("conditions_updated", {
            "active_count": len(existing["active_conditions"]),
            "conditions": [c.get("name") for c in existing["active_conditions"]]
        }),
        ("medication_updated", {
            "count": len(existing["current_medications"]),
            "medications": [m.get("name") for m in existing["current_medications"]]
        }),
    ]
    for event_type, details in timeline_events:
        try:
            db.add_timeline_event(actual_patient_id, event_type, details)
        except Exception as e:
            print(f"[EHR Agent] Timeline event '{event_type}' failed (non-blocking): {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # STEP 8 — Return full EHR package
    # ─────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] Compilation complete.")
    return {
        "status": "completed",
        "patient": patient,
        "consultation": consultation_record,
        "safety_audit": safety_audit,
        "translated_discharge": translated_discharge,
        "insurance_preauth": insurance_preauth,
        "timeline": db.get_timeline(actual_patient_id),
        "medical_record": existing
    }
