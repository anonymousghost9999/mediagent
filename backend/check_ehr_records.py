import sys
import os
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import supabase_client

try:
    res = supabase_client.table("ehr_records").select("*").execute()
    print(f"Total ehr_records: {len(res.data)}")
    for r in res.data:
        print(f"ID: {r.get('id')}, Consultation ID: {r.get('consultation_id')}, Is Draft: {r.get('is_draft')}, Diagnosis: {r.get('diagnosis')}")
except Exception as e:
    print("Error querying ehr_records:", e)
