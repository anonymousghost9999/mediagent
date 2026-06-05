// Dynamic Internal Medicine (IM) Report schema — rendered by <IMReportForm />.
export type IMField =
  | { id: string; label: string; type: "text" | "textarea"; placeholder?: string }
  | { id: string; label: string; type: "select"; options: string[] }
  | { id: string; label: string; type: "radio"; options: string[] }
  | { id: string; label: string; type: "checkbox"; options: string[] };

export type IMSection = { id: string; title: string; fields: IMField[] };

export const imReportSchema: IMSection[] = [
  {
    id: "subjective",
    title: "Subjective",
    fields: [
      { id: "chief_complaint", label: "Chief complaint", type: "textarea", placeholder: "Patient's primary concern…" },
      { id: "hpi", label: "History of present illness", type: "textarea" },
      { id: "onset", label: "Onset", type: "select", options: ["Sudden", "Gradual", "Recurrent", "Chronic"] },
      { id: "severity", label: "Severity", type: "radio", options: ["1 Routine", "2 Low", "3 Medium", "4 High", "5 Emergency"] },
    ],
  },
  {
    id: "objective",
    title: "Objective",
    fields: [
      { id: "bp", label: "Blood pressure (mmHg)", type: "text", placeholder: "e.g. 128/82" },
      { id: "pulse", label: "Pulse (bpm)", type: "text" },
      { id: "spo2", label: "SpO₂ (%)", type: "text" },
      { id: "temp", label: "Temperature (°C)", type: "text" },
      {
        id: "exam_findings",
        label: "Examination findings",
        type: "checkbox",
        options: ["Wheezing", "Crackles", "Tachycardia", "Edema", "Pallor", "Cyanosis"],
      },
    ],
  },
  {
    id: "assessment",
    title: "Assessment",
    fields: [
      { id: "diagnosis", label: "Diagnosis", type: "textarea" },
      { id: "icd10", label: "ICD-10 code", type: "text", placeholder: "e.g. J45.30" },
      { id: "differential", label: "Differential diagnosis", type: "textarea" },
    ],
  },
  {
    id: "plan",
    title: "Plan",
    fields: [
      { id: "prescription", label: "Prescription", type: "textarea" },
      { id: "investigations", label: "Investigations ordered", type: "checkbox", options: ["CBC", "CRP", "Chest X-ray", "Spirometry", "ECG", "Blood glucose"] },
      { id: "advice", label: "Lifestyle / advice", type: "textarea" },
      { id: "follow_up", label: "Follow-up", type: "select", options: ["No follow-up", "1 week", "2 weeks", "1 month", "3 months", "As needed"] },
    ],
  },
];

export type IMReportData = Record<string, string | string[]>;
