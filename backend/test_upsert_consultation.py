import sys
import os
sys.path.append(os.path.join(os.getcwd(), "backend"))

import app.database as db
from app.database import supabase_client

try:
    print("Testing save_consultation directly on Supabase...")
    # Fetch a waiting consultation to modify
    res = supabase_client.table("consultations").select("*").eq("status", "waiting").limit(1).execute()
    if not res.data:
        print("No waiting consultation found to test.")
        sys.exit(0)
    
    consult = res.data[0]
    print(f"Testing with Consultation ID: {consult['id']}")
    
    # Try updating its status to completed using db.save_consultation
    updated = {
        "id": consult["id"],
        "patient_id": consult["patient_id"],
        "status": "completed",
        "diagnosis": "Test Diagnosis",
        "icd10_code": "J06.9"
    }
    
    # Let's call the actual db function
    saved = db.save_consultation(updated)
    print("Successfully saved:", saved.get("status"))
except Exception as e:
    print("Caught error:", e)
