// Detailed past-consultation records. Keyed by id; surfaced from treatment history.
import type { TreatmentStatus } from "./store";

export type HistoryDetail = {
  id: string;
  date: string;
  doctor: string;
  diagnosis: string;
  icd10: string;
  prescription: string[];
  procedures: string[];
  reports: { name: string; type: string }[];
  recommendations: string;
  documents: { name: string; size: string }[];
  status: TreatmentStatus;
  followUp?: string;
  notes: string;
};

export const historyDetails: Record<string, HistoryDetail> = {
  "H-2026-06-05": {
    id: "H-2026-06-05",
    date: "2026-06-05",
    doctor: "Dr. R. Mehta",
    diagnosis: "Acute bronchospasm",
    icd10: "J45.901",
    prescription: ["Salbutamol 100mcg — 2 puffs PRN", "Prednisolone 20mg OD × 5 days"],
    procedures: ["Peak flow measurement"],
    reports: [{ name: "PEFR Report", type: "Pulmonary" }],
    recommendations: "Avoid dust exposure. Continue inhaler regularly. Review in 7 days.",
    documents: [{ name: "consultation_C-2027.pdf", size: "212 KB" }],
    status: "FOLLOW_UP_SCHEDULED",
    followUp: "2026-06-12",
    notes: "Patient reports overuse of rescue inhaler. Reinforced controller therapy.",
  },
  "H-2026-01-18": {
    id: "H-2026-01-18",
    date: "2026-01-18",
    doctor: "Dr. R. Mehta",
    diagnosis: "Mild persistent asthma",
    icd10: "J45.30",
    prescription: ["Budesonide 200mcg BID", "Salbutamol 100mcg PRN"],
    procedures: ["Spirometry"],
    reports: [{ name: "Spirometry Report", type: "Pulmonary" }],
    recommendations: "Daily controller. Trigger avoidance. Annual review.",
    documents: [{ name: "spirometry_2026-01.pdf", size: "318 KB" }],
    status: "TREATMENT_ONGOING",
    notes: "Baseline FEV1 78% predicted. Started on inhaled corticosteroid.",
  },
  "H-2025-11-04": {
    id: "H-2025-11-04",
    date: "2025-11-04",
    doctor: "Dr. Iyer",
    diagnosis: "Upper respiratory infection",
    icd10: "J06.9",
    prescription: ["Paracetamol 500mg TID", "Saline gargles"],
    procedures: [],
    reports: [],
    recommendations: "Hydration, rest. Return if symptoms persist > 7 days.",
    documents: [{ name: "initial_visit.pdf", size: "98 KB" }],
    status: "TREATMENT_COMPLETED",
    notes: "Self-limiting viral illness. No antibiotics indicated.",
  },
};

export const historyList = Object.values(historyDetails);
