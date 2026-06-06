import re
import copy
import app.database as db
import app.services.llm_service as llm
from datetime import datetime, timezone

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

ICD10_RE = re.compile(r"^[A-Z][0-9]{2}(\.[0-9]{1,4})?$")
TODAY = lambda: datetime.now(timezone.utc).date().isoformat()


def _validate_icd10(code: str) -> tuple[str, bool]:
    """Returns (code, is_valid). Invalid codes become 'PENDING_VALIDATION'."""
    if code and ICD10_RE.match(str(code).strip()):
        return str(code).strip(), True
    return "PENDING_VALIDATION", False


def _normalise_name(name: str) -> str:
    return (name or "").strip().lower()


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
    Full longitudinal EHR compilation pipeline (Steps 0–8).
    """
    print(f"[EHR Agent] Compiling EHR for Patient: {patient_id}")
    today = TODAY()
    now_ts = datetime.now(timezone.utc).isoformat()

    # Resolve actual patient profile ID — frontend sends consultation_id
    consult_row = db.get_consultation(patient_id)
    actual_patient_id = (
        consult_row.get("patient_id") or patient_id
        if consult_row else patient_id
    )
    print(f"[EHR Agent] Resolved patient_id: {actual_patient_id}")

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 0 — READ LONGITUDINAL RECORD
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 0 — Loading longitudinal record...")
    if existing_record is None:
        existing_record_raw = db.get_medical_record(actual_patient_id)
        existing_record = copy.deepcopy(
            existing_record_raw if existing_record_raw else db.BLANK_MEDICAL_RECORD
        )
    else:
        existing_record = copy.deepcopy(existing_record if existing_record else db.BLANK_MEDICAL_RECORD)
    # Ensure all keys exist (safe migration from older schema)
    for key, default in db.BLANK_MEDICAL_RECORD.items():
        if key not in existing_record:
            existing_record[key] = copy.deepcopy(default)

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 1 — MERGE DOCTOR EDITS
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 1 — Merging doctor edits...")
    final_consultation = copy.deepcopy(consultation_output)
    ai_overrides = {}  # audit trail: {field: {ai_value, doctor_value}}

    if doctor_edits:
        for field, doctor_val in doctor_edits.items():
            ai_val = final_consultation.get(field)
            if ai_val != doctor_val:
                ai_overrides[field] = {"ai_value": ai_val, "doctor_value": doctor_val}
            final_consultation[field] = doctor_val

    final_consultation["_audit_overrides"] = ai_overrides
    final_consultation["doctor_name"] = doctor_edits.get("doctor_name", "Attending Physician") if doctor_edits else "Attending Physician"

    # Resolve key fields
    final_diagnosis   = final_consultation.get("diagnosis", "Undiagnosed")
    final_icd10_raw   = final_consultation.get("icd10_code", "")
    final_meds        = final_consultation.get("prescribed_drugs") or final_consultation.get("medications") or []
    final_symptoms    = final_consultation.get("symptoms", [])
    final_follow_up   = final_consultation.get("follow_up") or {}
    doctor_notes      = (doctor_edits or {}).get("doctor_notes", "") or final_consultation.get("doctor_notes", "")

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 2 — DRUG SAFETY AUDIT
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 2 — Drug safety audit...")
    full_allergy_records = existing_record.get("allergy_records", [])
    full_allergy_list = [
        a.get("allergen", "") for a in full_allergy_records
    ] or patient_intake_output.get("allergies", []) or []

    current_meds_names = [
        m.get("name", "") for m in existing_record.get("current_medications", [])
    ]
    history_text = f"Current medications: {', '.join(current_meds_names) or 'None'}. " \
                   f"Medical history: {patient_intake_output.get('english_translation', '')}."

    safety_audit = {}
    try:
        safety_result = llm.evaluate_drug_safety(
            allergies_list=full_allergy_list,
            history_text=history_text,
            prescribed_meds=final_meds,
            allergy_records=full_allergy_records,
            current_medications=existing_record.get("current_medications", [])
        )
        safety_audit = {
            "conflicts": safety_result.get("description", ""),
            "severity": safety_result.get("severity", "None").lower(),
            "has_conflict": safety_result.get("has_conflict", False),
            "checked_at": now_ts
        }
    except Exception as e:
        print(f"[EHR Agent] Safety audit LLM unavailable: {e}")
        safety_audit = {
            "conflicts": [],
            "severity": "unknown",
            "has_conflict": False,
            "error": str(e),
            "checked_at": now_ts
        }

    # Block on critical
    severity_lower = str(safety_audit.get("severity", "")).lower()
    if severity_lower in ("high", "critical"):
        print("[EHR Agent] CRITICAL safety conflict — returning safety_block.")
        return {
            "status": "safety_block",
            "safety_audit": safety_audit,
            "message": "Critical drug-allergy or drug-drug conflict detected. Doctor must re-confirm before proceeding."
        }

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 3 — BILINGUAL DISCHARGE SUMMARY
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 3 — Bilingual discharge summary...")
    patient = db.get_patient(actual_patient_id)
    if not patient:
        # Fallback: try the raw patient_id in case caller already passed profile ID
        patient = db.get_patient(patient_id)
    if not patient:
        # Construct minimal patient dict so pipeline doesn't crash on missing profile
        print(f"[EHR Agent] WARNING: Could not find patient profile for {actual_patient_id}. Using minimal stub.")
        patient = {"id": actual_patient_id, "language": "english", "name": "Unknown", "status": "completed"}

    patient_language = patient.get("language", "english")
    continue_meds = ", ".join(
        m.get("name", "") for m in existing_record.get("current_medications", []) if m.get("name")
    ) or "None"

    discharge_lines = [
        f"Diagnosis: {final_diagnosis}",
        f"ICD-10: {final_icd10_raw}",
        "Prescribed Medications:"
    ]
    for m in final_meds:
        discharge_lines.append(f"  - {m.get('name')} {m.get('dosage')} — {m.get('frequency')} for {m.get('duration')}")
    if not final_meds:
        discharge_lines.append("  - No new medications prescribed.")
    discharge_lines.append(f"Medications to continue: {continue_meds}")
    follow_up_timing = final_follow_up.get("timing", "") if isinstance(final_follow_up, dict) else str(final_follow_up)
    if follow_up_timing:
        discharge_lines.append(f"Follow-up: {follow_up_timing}")
    if doctor_notes:
        discharge_lines.append(f"Doctor's advice: {doctor_notes}")

    english_discharge = "\n".join(discharge_lines)
    translated_discharge = english_discharge
    try:
        translated_discharge = llm.translate_discharge_summary(english_discharge, patient_language)
    except Exception as e:
        print(f"[EHR Agent] Discharge translation LLM unavailable: {e}")

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 4 — INSURANCE PRE-AUTH
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 4 — Insurance pre-auth...")
    validated_icd10, icd10_valid = _validate_icd10(final_icd10_raw)

    prior_relevant = [
        c for c in existing_record.get("active_conditions", [])
        if _normalise_name(c.get("name", "")) in _normalise_name(final_diagnosis)
        or any(_normalise_name(c.get("name", "")) in _normalise_name(s) for s in final_symptoms)
    ]

    insurance_preauth = {
        "icd10_code": validated_icd10,
        "icd10_valid": icd10_valid,
        "icd10_flag": None if icd10_valid else "ICD-10 code failed format validation — set to PENDING_VALIDATION",
        "clinical_justification": (
            f"Patient presents with {', '.join(final_symptoms) or 'reported symptoms'}. "
            f"History: {patient.get('medical_history') or 'No prior history on file'}. "
            f"Confirmed by clinical consultation. Diagnosis: {final_diagnosis}."
        ),
        "proposed_treatment": [f"{m.get('name')} ({m.get('dosage')})" for m in final_meds],
        "prior_conditions_relevant": prior_relevant
    }

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 5 — UPDATE LONGITUDINAL PATIENT RECORD
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 5 — Updating longitudinal record...")

    # 5a — Consultation count
    existing_record["total_consultations"] += 1
    visit_number = existing_record["total_consultations"]

    # 5b — Active conditions
    conditions = existing_record.setdefault("active_conditions", [])
    new_cond_names = [d.strip() for d in final_diagnosis.split(",") if d.strip()] if final_diagnosis else []
    for cond_name in new_cond_names:
        match = next(
            (c for c in conditions if _normalise_name(c.get("name", "")) == _normalise_name(cond_name)),
            None
        )
        if match:
            match["last_seen"] = today
            # Doctor-explicit status change only
            if doctor_edits and "condition_status" in doctor_edits:
                match["status"] = doctor_edits["condition_status"]
            match.setdefault("notes", []).append(
                {"visit": visit_number, "date": today, "note": doctor_notes or f"Reviewed — {final_diagnosis}"}
            )
        else:
            conditions.append({
                "name": cond_name,
                "icd10_code": validated_icd10,
                "first_seen": today,
                "last_seen": today,
                "status": "active",
                "notes": [{"visit": visit_number, "date": today, "note": f"Initial diagnosis — {cond_name}"}]
            })

    # 5c — Allergy records
    allergy_records = existing_record.setdefault("allergy_records", [])
    # Gather allergies from intake + doctor edits
    intake_allergies = patient_intake_output.get("allergies", "") or ""
    if isinstance(intake_allergies, str):
        intake_allergies = [a.strip() for a in intake_allergies.split(",") if a.strip()]
    new_allergies = list(intake_allergies) + list((doctor_edits or {}).get("new_allergies", []))

    for allergen in new_allergies:
        match = next(
            (a for a in allergy_records if _normalise_name(a.get("allergen", "")) == _normalise_name(allergen)),
            None
        )
        if match:
            match["last_confirmed"] = today
            # Update severity only if this visit specifies one
            if (doctor_edits or {}).get("allergy_severity"):
                match["severity"] = doctor_edits["allergy_severity"]
        else:
            allergy_records.append({
                "allergen": allergen,
                "reaction_type": "unknown",
                "severity": "moderate",
                "first_reported": today,
                "last_confirmed": today
            })

    # 5d — Treatment progress + recent developments
    prior_treatment_response = "Not reported"
    if doctor_notes and ("improved" in doctor_notes.lower() or "better" in doctor_notes.lower()):
        prior_treatment_response = "Patient reports improvement with prior treatment."
    elif doctor_notes and ("worse" in doctor_notes.lower() or "no improvement" in doctor_notes.lower()):
        prior_treatment_response = "No improvement noted with prior treatment."

    plan_desc = final_follow_up.get("instructions", "") if isinstance(final_follow_up, dict) else str(final_follow_up)

    existing_record.setdefault("treatment_progress", []).append({
        "visit_number": visit_number,
        "date": today,
        "diagnosis": final_diagnosis,
        "treatment_given": plan_desc or f"{len(final_meds)} medication(s) prescribed.",
        "response_to_prior_treatment": prior_treatment_response,
        "doctor_notes": doctor_notes
    })

    # Generate development summary (with LLM fallback)
    development_text = f"Visit {visit_number}: {final_diagnosis} diagnosed."
    significance = "routine"
    try:
        dev_prompt = (
            f"In one sentence, summarise what changed or was newly discovered at this visit.\n"
            f"Diagnosis: {final_diagnosis}. Symptoms: {', '.join(final_symptoms)}. "
            f"Doctor notes: {doctor_notes or 'None'}. Prior visit count: {visit_number - 1}."
        )
        development_text = llm.call_openrouter(
            messages=[{"role": "user", "content": dev_prompt}],
            max_tokens=80
        ).strip()
        severity_lower_audit = str(safety_audit.get("severity", "")).lower()
        if severity_lower_audit in ("high", "medium"):
            significance = "critical"
        elif visit_number == 1 or "new" in development_text.lower():
            significance = "notable"
    except Exception:
        pass  # keep default fallback

    recent = existing_record.setdefault("recent_developments", [])
    recent.append({"date": today, "development": development_text, "significance": significance})
    existing_record["recent_developments"] = recent[-10:]  # keep last 10

    # 5e — Medications
    old_current = copy.deepcopy(existing_record.get("current_medications", []))
    if old_current:
        existing_record.setdefault("medication_history", []).append({
            "medications": old_current,
            "prescribed_at": old_current[0].get("prescribed_at", "unknown") if old_current else "unknown",
            "archived_at": today,
            "visit_number": visit_number - 1
        })

    # Also log suggested vs prescribed
    existing_record.setdefault("medication_history", []).append({
        "suggested": final_consultation.get("suggested_medications", []),
        "prescribed": final_meds,
        "visit_number": visit_number,
        "date": today
    })

    if final_meds:
        existing_record["current_medications"] = [
            {
                "name": m.get("name"),
                "dosage": m.get("dosage"),
                "frequency": m.get("frequency"),
                "duration": m.get("duration"),
                "prescribed_at": today,
                "prescribed_by": final_consultation.get("doctor_name", "Attending Physician")
            }
            for m in final_meds
        ]
    elif visit_number > 1:
        existing_record["current_medications"] = [
            {"name": "Patient is not using any current medication", "prescribed_at": today}
        ]
    else:
        existing_record["current_medications"] = []

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 6 — PERSIST (best-effort atomic)
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 6 — Persisting to DB...")
    consultation_record = db.save_consultation({
        "id": patient_id,           # keep the consultation row id (frontend sends consultation_id)
        "patient_id": actual_patient_id,
        "status": "completed",
        "approved_at": now_ts,
        "symptoms": final_symptoms,
        "diagnosis": final_diagnosis,
        "icd10_code": validated_icd10,
        "transcript": consultation_output.get("raw_transcript", ""),
        "medications": final_meds,
        "doctor_notes": doctor_notes,
        "safety_audit": safety_audit,
        "original_language": patient_intake_output.get("original_language", "en-IN"),
        "intake_original_transcript": patient_intake_output.get("original_transcript", ""),
        "intake_english_translation": patient_intake_output.get("english_translation", ""),
        "consult_original_transcript": consultation_output.get("raw_transcript", ""),
        "consult_english_transcript": consultation_output.get("english_transcript", "")
    })

    try:
        db.upsert_medical_record(actual_patient_id, existing_record)
    except Exception as e:
        print(f"[EHR Agent] WARNING: upsert_medical_record failed — {e}. Consultation still saved.")

    # Update patient status
    patient["status"] = "completed"
    db.save_patient(patient)

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 7 — EHR TIMELINE EVENTS
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] STEP 7 — Writing timeline events...")
    timeline_fns = [
        (actual_patient_id, "intake", {
            "summary": patient_intake_output.get("english_translation", "") or consultation_output.get("raw_transcript", ""),
            "severity_score": patient_intake_output.get("severity_score"),
            "rationale": patient_intake_output.get("triage_rationale")
        }),
        (actual_patient_id, "consultation_finalized", {
            "summary": final_diagnosis,
            "consultation_id": consultation_record.get("id"),
            "icd10_code": validated_icd10,
            "prescriptions_count": len(final_meds)
        }),
    ]

    if safety_audit.get("has_conflict"):
        timeline_fns.append((actual_patient_id, "safety_alert", {
            "severity": safety_audit.get("severity"),
            "conflicts": safety_audit.get("conflicts")
        }))
    else:
        timeline_fns.append((actual_patient_id, "safety_clear", {
            "severity": safety_audit.get("severity", "None"),
            "checked_at": safety_audit.get("checked_at")
        }))

    timeline_fns += [
        (actual_patient_id, "conditions_updated", {
            "active_count": len(existing_record.get("active_conditions", [])),
            "conditions": [c.get("name") for c in existing_record.get("active_conditions", [])]
        }),
        (actual_patient_id, "medication_updated", {
            "count": len(existing_record.get("current_medications", [])),
            "medications": [m.get("name") for m in existing_record.get("current_medications", [])]
        }),
    ]

    for args in timeline_fns:
        try:
            db.add_timeline_event(*args)
        except Exception as e:
            print(f"[EHR Agent] Timeline event failed (non-blocking): {e}")

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 8 — RETURN EHR PACKAGE
    # ──────────────────────────────────────────────────────────────────────────
    print("[EHR Agent] EHR compilation complete.")
    return {
        "status": "completed",
        "patient": patient,
        "consultation": consultation_record,
        "safety_audit": safety_audit,
        "translated_discharge": translated_discharge,
        "insurance_preauth": insurance_preauth,
        "timeline": db.get_timeline(actual_patient_id),
        "medical_record": existing_record
    }
