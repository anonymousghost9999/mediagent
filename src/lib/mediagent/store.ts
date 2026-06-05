// Lightweight reactive in-memory store for the UI shell (no backend yet).
import { useSyncExternalStore } from "react";

type Listener = () => void;

function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set: (updater: (prev: T) => T) => {
      state = updater(state);
      listeners.forEach((l) => l());
    },
    subscribe: (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

// ---------- Audit log ----------
export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  before?: unknown;
  after?: unknown;
  note?: string;
};

const seedAudit: AuditEntry[] = [
  { id: "A-0004", at: "10:42:03", actor: "Dr. Mehta", action: "REPORT_APPROVED", entity: "report:R-9981" },
  { id: "A-0003", at: "10:41:12", actor: "agent:consultation", action: "AI_DRAFT_GENERATED", entity: "consultation:C-2027" },
  { id: "A-0002", at: "10:38:55", actor: "Aarav Reddy", action: "INTAKE_COMPLETED", entity: "consultation:C-2027" },
  { id: "A-0001", at: "10:31:09", actor: "Aarav Reddy", action: "LOGIN", entity: "user:PT-100428" },
];

export const auditStore = createStore<AuditEntry[]>(seedAudit);

export function logAudit(entry: Omit<AuditEntry, "id" | "at"> & { at?: string }) {
  auditStore.set((prev) => [
    {
      id: `A-${String(prev.length + 1).padStart(4, "0")}`,
      at: entry.at ?? new Date().toLocaleTimeString(),
      ...entry,
    },
    ...prev,
  ]);
}

// ---------- Patient profile (editable) ----------
import { patient as seedPatient } from "./data";
export const profileStore = createStore({ ...seedPatient });

// ---------- Treatment status ----------
export const treatmentStatuses = [
  "REVISIT_REQUIRED",
  "FOLLOW_UP_SCHEDULED",
  "TREATMENT_ONGOING",
  "TREATMENT_COMPLETED",
] as const;
export type TreatmentStatus = (typeof treatmentStatuses)[number];
export const treatmentStatusLabel: Record<TreatmentStatus, string> = {
  REVISIT_REQUIRED: "Revisit required",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled",
  TREATMENT_ONGOING: "Treatment ongoing",
  TREATMENT_COMPLETED: "Treatment completed",
};
