// API Client wrapper for connecting the React frontend with the FastAPI backend orchestrator.
// Backend lives at mediagent/backend/ — start it with `npm run dev:backend` or `npm start` (runs both).

export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";


export type PatientIntakeRequest = {
  patient_id?: string;
  name: string;
  age: number;
  gender: string;
  allergies: string[];
  medical_history: string;
  symptom_text: string;
  language: string;
  mode?: string;
};

export type ApproveConsultationRequest = {
  patient_id: string;
  patient_intake_output: any;
  consultation_output: any;
  doctor_edits?: any;
};

export async function postIntake(data: PatientIntakeRequest) {
  const response = await fetch(`${API_BASE_URL}/api/intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    let errorMsg = `Intake failed: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorMsg = errJson.detail;
      }
    } catch (e) {}
    throw new Error(errorMsg);
  }
  return response.json();
}

export async function postIntakeAudio(formData: FormData) {
  const response = await fetch(`${API_BASE_URL}/api/intake-audio`, {
    method: "POST",
    body: formData, // Browser sets Content-Type automatically for FormData
  });
  if (!response.ok) {
    let errorMsg = `Intake Audio failed: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorMsg = errJson.detail;
      }
    } catch (e) {}
    throw new Error(errorMsg);
  }
  return response.json();
}

export async function startConsultation(patientId: string) {
  const response = await fetch(`${API_BASE_URL}/api/consult/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ patient_id: patientId }),
  });
  if (!response.ok) {
    throw new Error(`Start consultation failed: ${response.statusText}`);
  }
  return response.json();
}

export async function transcribeConsultation(formData: FormData) {
  const response = await fetch(`${API_BASE_URL}/api/consult/transcribe-extract`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.statusText}`);
  }
  return response.json();
}

export async function extractTextConsultation(patientId: string, notes: string) {
  const params = new URLSearchParams({ patient_id: patientId, notes });
  const response = await fetch(`${API_BASE_URL}/api/consult/text-extract?${params.toString()}`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Text extraction failed: ${response.statusText}`);
  }
  return response.json();
}

export async function approveConsultation(data: ApproveConsultationRequest) {
  const response = await fetch(`${API_BASE_URL}/api/consult/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Approval failed: ${response.statusText}`);
  }
  return response.json();
}

export async function getPatients() {
  const response = await fetch(`${API_BASE_URL}/api/patients`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`Failed to list patients: ${response.statusText}`);
  }
  return response.json();
}

export async function getPatientTimeline(patientId: string) {
  const response = await fetch(`${API_BASE_URL}/api/patients/${patientId}/timeline`, {
    method: "GET",
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch timeline: ${response.statusText}`);
  }
  return response.json();
}


export type SessionSummary = {
  overview: string;
  key_findings: string[];
  action_items: string[];
  patient_instructions: string[];
  risk_flags: string[];
};

export async function getSessionSummary(
  transcript: string,
  clinicalFacts?: {
    symptoms?: string[];
    diagnosis?: string;
    icd10_code?: string;
    prescribed_drugs?: { name: string; dosage: string; frequency: string; duration: string }[];
  }
): Promise<SessionSummary> {
  const response = await fetch(`${API_BASE_URL}/api/consult/session-summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, clinical_facts: clinicalFacts ?? {} }),
  });
  if (!response.ok) throw new Error(`Session summary failed: ${response.statusText}`);
  return response.json();
}

export async function fetchHpiSummary(intakeReport: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/consult/hpi-summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intake_report: intakeReport }),
  });
  if (!response.ok) throw new Error(`HPI summary failed: ${response.statusText}`);
  const data = await response.json();
  return data.hpi ?? "";
}
