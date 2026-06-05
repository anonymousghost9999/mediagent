// Mock data + role context for MediAgent UI shell.
// All AI fields are DRAFT until doctor approval — see /mnt/documents/MediAgent_Specification.md

export type Role = "patient" | "doctor" | "admin";

export type Severity = 1 | 2 | 3 | 4 | 5;
export const severityLabel: Record<Severity, string> = {
  1: "Routine",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Emergency",
};

export type ReviewStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "MODIFIED_AND_APPROVED"
  | "REJECTED";

export type ConsultationState =
  | "CREATED"
  | "INTAKE_IN_PROGRESS"
  | "INTAKE_COMPLETED"
  | "DOCTOR_REVIEW_PENDING"
  | "CONSULTATION_ACTIVE"
  | "DOCTOR_APPROVED"
  | "EHR_FINALIZED"
  | "CLOSED";

export const patient = {
  id: "PT-100428",
  mrn: "MRN-2026-00428",
  fullName: "Aarav Reddy",
  age: 34,
  gender: "M",
  dob: "1991-03-12",
  mobile: "+91 98480 12345",
  email: "aarav.reddy@example.com",
  address: "Plot 14, Banjara Hills, Hyderabad",
  bloodGroup: "O+",
  heightCm: 176,
  weightKg: 78,
  bmi: 25.2,
  bp: "128/82",
  bloodSugar: "104 mg/dL",
  allergies: ["Penicillin (HIGH)", "Pollen (LOW)"],
  chronic: ["Asthma"],
  currentMeds: ["Salbutamol 100mcg PRN"],
  emergency: "Priya Reddy · Spouse · +91 98480 99001",
  insurance: "Star Health",
  insuranceNumber: "SH-77124-991",
};

export const timeline = [
  { date: "2026-06-05", type: "Consultation", title: "Wheezing follow-up", doctor: "Dr. Mehta" },
  { date: "2026-05-12", type: "Lab Report", title: "PEFR 420 L/min", doctor: "—" },
  { date: "2026-04-02", type: "Prescription", title: "Salbutamol refill", doctor: "Dr. Mehta" },
  { date: "2026-01-18", type: "Diagnosis", title: "Mild persistent asthma", doctor: "Dr. Mehta" },
  { date: "2025-11-04", type: "Consultation", title: "Initial visit", doctor: "Dr. Iyer" },
];

export type FollowUpEntry = {
  date: string;
  doctor: string;
  summary: string;
  vitals?: string;
  changes?: string;
  outcome: string;
};

export const ongoing = [
  {
    diagnosis: "Mild persistent asthma (J45.30)",
    status: "ACTIVE" as const,
    treatmentStatus: "FOLLOW_UP_SCHEDULED" as const,
    doctor: "Dr. R. Mehta",
    meds: ["Salbutamol 100mcg PRN", "Budesonide 200mcg BID"],
    nextAppt: "2026-06-20 · 10:30",
    followUp: "Review in 7 days · keep PEFR diary · ER if SpO₂ < 92%",
    progress: "Symptoms stable. PEFR improving week-over-week.",
    followUpHistory: [
      {
        date: "2026-06-05",
        doctor: "Dr. R. Mehta",
        summary: "Wheezing follow-up. Rescue inhaler overuse discussed; controller therapy reinforced.",
        vitals: "BP 128/82 · SpO₂ 97% · PEFR 420 L/min",
        changes: "Added Prednisolone 20mg OD × 5 days.",
        outcome: "FOLLOW_UP_SCHEDULED",
      },
      {
        date: "2026-05-12",
        doctor: "Dr. R. Mehta",
        summary: "Routine review. PEFR diary reviewed — steady improvement.",
        vitals: "SpO₂ 98% · PEFR 410 L/min",
        changes: "No medication change.",
        outcome: "TREATMENT_ONGOING",
      },
      {
        date: "2026-01-18",
        doctor: "Dr. R. Mehta",
        summary: "Initial diagnosis. Started inhaled corticosteroid.",
        vitals: "FEV1 78% predicted",
        changes: "Started Budesonide 200mcg BID + Salbutamol PRN.",
        outcome: "TREATMENT_ONGOING",
      },
    ] satisfies FollowUpEntry[],
  },
];

export const history = [
  { date: "2026-06-05", doctor: "Dr. Mehta", dx: "Wheezing", rx: "Salbutamol PRN", proc: "—" },
  { date: "2026-01-18", doctor: "Dr. Mehta", dx: "Mild persistent asthma", rx: "Budesonide", proc: "Spirometry" },
  { date: "2025-11-04", doctor: "Dr. Iyer", dx: "URI", rx: "Symptomatic", proc: "—" },
];

export const doctorQueue = [
  { id: "C-2031", patient: "Meera Sharma", severity: 5 as Severity, complaint: "Acute chest pain", waited: "4m" },
  { id: "C-2029", patient: "Rohan Das", severity: 4 as Severity, complaint: "Severe headache, vomiting", waited: "12m" },
  { id: "C-2027", patient: "Aarav Reddy", severity: 3 as Severity, complaint: "Wheezing, 2d cough", waited: "18m" },
  { id: "C-2024", patient: "Lakshmi N.", severity: 2 as Severity, complaint: "Skin rash", waited: "26m" },
  { id: "C-2018", patient: "Vikram J.", severity: 1 as Severity, complaint: "Routine BP check", waited: "41m" },
];

export const aiFields = [
  {
    id: "f1",
    label: "Suggested Diagnosis",
    ai: "Acute bronchospasm secondary to mild persistent asthma (J45.901)",
    status: "PENDING_REVIEW" as ReviewStatus,
    confidence: 0.86,
  },
  {
    id: "f2",
    label: "Suggested Prescription",
    ai: "Salbutamol 100mcg — 2 puffs PRN; Prednisolone 20mg OD × 5 days",
    status: "PENDING_REVIEW" as ReviewStatus,
    confidence: 0.78,
  },
  {
    id: "f3",
    label: "Follow-Up",
    ai: "Review in 7 days. PEFR diary. ER if SpO₂ < 92%.",
    status: "PENDING_REVIEW" as ReviewStatus,
    confidence: 0.91,
  },
];

export const safetyAlerts = [
  { level: "HIGH" as const, msg: "Prednisolone × patient has Type-2 DM risk markers. Monitor glucose." },
  { level: "LOW" as const, msg: "Salbutamol — no interactions with current medications." },
];

export const auditSample = [
  { at: "10:42:03", actor: "Dr. Mehta", action: "REPORT_APPROVED", entity: "report:R-9981" },
  { at: "10:41:12", actor: "agent:consultation", action: "AI_DRAFT_GENERATED", entity: "consultation:C-2027" },
  { at: "10:38:55", actor: "Aarav Reddy", action: "INTAKE_COMPLETED", entity: "consultation:C-2027" },
  { at: "10:31:09", actor: "Aarav Reddy", action: "LOGIN", entity: "user:PT-100428" },
];
