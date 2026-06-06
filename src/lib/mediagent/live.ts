import { supabase } from "@/integrations/supabase/client";
import { patient, ongoing, timeline, doctorQueue, auditSample } from "@/lib/mediagent/data";

type MaybeRow<T> = T | null;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item));
  return [];
};

const fmtDate = (value?: string | null) => (value ? value.slice(0, 10) : "—");

export const isDummySession = () => false;

export async function getPatientProfile(userId: string) {
  if (isDummySession()) {
    return {
      profile: {
        id: userId,
        full_name: patient.fullName,
        email: patient.email,
        mobile: patient.mobile,
        dob: patient.dob,
        gender: patient.gender,
        address: patient.address,
        blood_group: patient.bloodGroup,
        height_cm: patient.heightCm,
        weight_kg: patient.weightKg,
        allergies: patient.allergies,
        chronic_conditions: patient.chronic,
        emergency_contact: patient.emergency,
        insurance_provider: patient.insurance,
        insurance_number: patient.insuranceNumber,
        mrn: patient.mrn,
      },
      details: null
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return { profile, details: null };
}

export async function getPatientConsultations(userId: string) {
  if (isDummySession()) {
    return [
      {
        id: "c-waiting-1",
        status: "waiting",
        severity_score: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        assigned_doctor_id: "d9999999-9999-9999-9999-999999999999",
        hospital_id: "b1111111-1111-1111-1111-111111111111"
      }
    ];
  }

  const { data, error } = await supabase
    .from("consultations")
    .select("id,status,severity_score,created_at,updated_at,assigned_doctor_id,hospital_id")
    .eq("patient_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPatientEhrs(consultationIds: string[]) {
  if (isDummySession()) {
    return [
      {
        id: "e-record-1",
        consultation_id: "c-waiting-1",
        doctor_id: "d9999999-9999-9999-9999-999999999999",
        diagnosis: "Tension Headache",
        prescriptions: ["Paracetamol 500mg Twice Daily x 3 days"],
        is_draft: true,
        created_at: new Date().toISOString()
      }
    ];
  }

  if (!consultationIds.length) return [] as Array<Record<string, unknown>>;
  const { data, error } = await supabase
    .from("ehr_records")
    .select("*")
    .in("consultation_id", consultationIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPatientTimeline(userId: string) {
  if (isDummySession()) {
    return timeline.map((row) => ({
      date: row.date,
      type: row.type,
      title: row.title,
      doctor: row.doctor,
      consultation: { id: "mock-id" },
      ehr: null
    }));
  }

  const consultations = await getPatientConsultations(userId);
  const ehrs = await getPatientEhrs(consultations.map((row) => row.id));
  const ehrByConsultation = new Map(ehrs.map((row) => [row.consultation_id as string, row]));

  return consultations.map((consultation) => {
    const ehr = ehrByConsultation.get(consultation.id) as MaybeRow<Record<string, any>>;
    return {
      date: fmtDate(consultation.created_at),
      type: consultation.status ? String(consultation.status).replaceAll("_", " ") : "Consultation",
      title: (ehr?.diagnosis as string | undefined) ?? `Consultation ${consultation.id}`,
      doctor: consultation.assigned_doctor_id ? consultation.assigned_doctor_id.slice(0, 8) : "—",
      consultation,
      ehr,
    };
  });
}

export async function getPatientPrescriptions(userId: string) {
  if (isDummySession()) {
    return [
      {
        id: "mock-pres-1",
        prescription: "Salbutamol 100mcg PRN",
        date: "2026-06-05",
        doctor: "Dr. Mehta",
        status: "ACTIVE"
      }
    ];
  }

  const consultations = await getPatientConsultations(userId);
  const ehrs = await getPatientEhrs(consultations.map((row) => row.id));
  return ehrs.flatMap((row) => {
    const prescriptions = asStringArray((row as Record<string, unknown>).prescriptions);
    return prescriptions.map((prescription) => ({
      id: String(row.id),
      prescription,
      date: fmtDate(String(row.created_at ?? null)),
      doctor: (row.doctor_id as string | undefined)?.slice(0, 8) ?? "—",
      status: row.is_draft ? "DRAFT" : "ACTIVE",
    }));
  });
}

export async function getPatientReports(userId: string) {
  if (isDummySession()) {
    return [
      {
        id: "mock-rep-1",
        type: "Consultation",
        date: "2026-06-05",
        status: "FINALIZED",
        download: "https://example.com/mock.pdf"
      }
    ];
  }

  const consultations = await getPatientConsultations(userId);
  const ehrs = await getPatientEhrs(consultations.map((row) => row.id));
  return ehrs
    .filter((row) => !row.is_draft)
    .map((row) => ({
      id: String(row.id),
      type: row.diagnosis ? "Consultation" : "Report",
      date: fmtDate(String(row.approved_at ?? row.created_at ?? null)),
      status: row.approved_at ? "FINALIZED" : "APPROVED",
      download: row.discharge_summary_url as string | undefined,
    }));
}

export async function getPatientTreatments(userId: string) {
  if (isDummySession()) {
    return ongoing.map((row) => ({
      diagnosis: row.diagnosis,
      status: row.status,
      treatmentStatus: row.treatmentStatus,
      doctor: row.doctor,
      meds: row.meds,
      nextAppt: row.nextAppt.split(" · ")[0],
      progress: row.progress,
      followUp: row.followUp,
      followUpHistory: row.followUpHistory,
      consultation: { id: "mock-id" },
      ehr: null
    }));
  }

  const consultations = await getPatientConsultations(userId);
  const ehrs = await getPatientEhrs(consultations.map((row) => row.id));
  return consultations.map((consultation) => {
    const ehr = ehrs.find((row) => row.consultation_id === consultation.id) as MaybeRow<Record<string, any>>;
    return {
      diagnosis: (ehr?.diagnosis as string | undefined) ?? `Consultation ${consultation.id}`,
      status: (consultation.status as string | undefined) ?? "CONSULTATION_ACTIVE",
      treatmentStatus: consultation.status === "completed" ? "TREATMENT_COMPLETED" : "TREATMENT_ONGOING",
      doctor: ehr?.doctor_id ? String(ehr.doctor_id) : (consultation.assigned_doctor_id ? consultation.assigned_doctor_id.slice(0, 8) : "—"),
      meds: asStringArray(ehr?.prescriptions).length ? asStringArray(ehr?.prescriptions) : [],
      nextAppt: fmtDate(consultation.created_at),
      progress: ehr?.diagnosis ? String(ehr.diagnosis) : "Live record loaded from Supabase.",
      followUp: "Review with your doctor.",
      followUpHistory: [],
      consultation,
      ehr,
    };
  });
}

export async function getDoctorQueue() {
  if (isDummySession()) {
    return doctorQueue;
  }

  const { data, error } = await supabase
    .from("consultations")
    .select("id,patient_id,status,severity_score,created_at,assigned_doctor_id,chief_complaint")
    .order("severity_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const consultations = data ?? [];
  const patientIds = consultations.map((row) => row.patient_id).filter(Boolean) as string[];
  const { data: profiles } = patientIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", patientIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));
  return consultations.map((row) => ({
    id: row.id,
    patient: nameById.get(row.patient_id ?? "") ?? row.patient_id?.slice(0, 8) ?? "Unknown",
    severity: Number(row.severity_score ?? 1),
    complaint: (row.chief_complaint as string | null) || (row.status ? `${row.status.replaceAll("_", " ").toLowerCase()} · consultation` : "Live consultation"),
    waited: row.created_at ? `${Math.max(1, Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000))}m` : "—",
    created_at: row.created_at,
    patient_id: row.patient_id,
    assigned_doctor_id: row.assigned_doctor_id,
    status: row.status,
    record_name: row.id,
  }));
}

export async function getDoctorReviews() {
  if (isDummySession()) {
    return [
      {
        id: "mock-rev-1",
        patient: "Meera Sharma",
        type: "Consultation Report",
        status: "PENDING_REVIEW"
      }
    ];
  }

  const { data, error } = await supabase
    .from("ehr_records")
    .select("id,consultation_id,doctor_id,diagnosis,is_draft,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ehrs = (data ?? []).filter((row) => row.is_draft);
  const consultationIds = ehrs.map((row) => row.consultation_id).filter(Boolean) as string[];
  const { data: consultations } = consultationIds.length
    ? await supabase.from("consultations").select("id,patient_id").in("id", consultationIds)
    : { data: [] };
  const patientIds = (consultations ?? []).map((row) => row.patient_id).filter(Boolean) as string[];
  const { data: profiles } = patientIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", patientIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));
  const consultById = new Map((consultations ?? []).map((row) => [row.id as string, row.patient_id as string | null]));
  return ehrs.map((row) => ({
    id: String(row.id),
    patient: nameById.get(consultById.get(row.consultation_id ?? "") ?? "") ?? consultById.get(row.consultation_id ?? "")?.slice(0, 8) ?? "Unknown",
    type: row.diagnosis ? "Consultation Report" : "Draft",
    status: row.is_draft ? "PENDING_REVIEW" : "APPROVED",
  }));
}

export async function getDoctorAppointments(doctorId?: string) {
  if (isDummySession()) {
    return [
      {
        id: "c-waiting-1",
        patient_id: "a2d21a9a-7a0e-4d43-987a-6eb9df7bcc7a",
        status: "waiting",
        created_at: new Date().toISOString(),
        assigned_doctor_id: "d9999999-9999-9999-9999-999999999999",
        severity_score: 3
      }
    ];
  }

  const query = supabase
    .from("consultations")
    .select("id,patient_id,status,created_at,assigned_doctor_id,severity_score")
    .order("created_at", { ascending: true })
    .limit(20);
  const { data, error } = doctorId
    ? await query.eq("assigned_doctor_id", doctorId)
    : await query;
  if (error) throw error;
  return data ?? [];
}

export async function getDoctorPatients() {
  if (isDummySession()) {
    return [
      {
        id: "a2d21a9a-7a0e-4d43-987a-6eb9df7bcc7a",
        full_name: "Demo Patient",
        mrn: "MRN-2026-00428",
        created_at: new Date().toISOString()
      }
    ];
  }

  const { data, error } = await supabase.from("profiles").select("id,full_name,mrn,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminUsers() {
  if (isDummySession()) {
    return [
      {
        id: "a2d21a9a-7a0e-4d43-987a-6eb9df7bcc7a",
        full_name: "Demo Patient",
        email: "patient@mediagent.com",
        created_at: new Date().toISOString(),
        role: "patient"
      },
      {
        id: "d9999999-9999-9999-9999-999999999999",
        full_name: "Dr. R. Mehta",
        email: "doctor@mediagent.com",
        created_at: new Date().toISOString(),
        role: "doctor"
      }
    ];
  }

  const { data, error } = await supabase.from("profiles").select("id,full_name,email,created_at,role").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminDoctors() {
  if (isDummySession()) {
    return [
      {
        id: "d9999999-9999-9999-9999-999999999999",
        full_name: "Dr. R. Mehta",
        department: "Pulmonology",
        specialization: "Asthma Specialist",
        license_number: "MCI-88914",
        role: "doctor"
      }
    ];
  }

  const { data, error } = await supabase.from("profiles").select("id,full_name,department,specialization,license_number,role").eq("role", "doctor").order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getHospitals() {
  if (isDummySession()) {
    return [
      {
        id: "b1111111-1111-1111-1111-111111111111",
        hospital_name: "City General Hospital",
        hospital_code: "CGH-HYD",
        address: "Banjara Hills, Hyderabad"
      }
    ];
  }

  const { data, error } = await supabase.from("hospitals").select("id,hospital_name,hospital_code,address").order("hospital_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAuditLogs() {
  if (isDummySession()) {
    return auditSample;
  }

  const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function getConsultationById(id: string) {
  if (isDummySession()) {
    return {
      consultation: {
        id: "c-waiting-1",
        patient_id: "a2d21a9a-7a0e-4d43-987a-6eb9df7bcc7a",
        hospital_id: "b1111111-1111-1111-1111-111111111111",
        assigned_doctor_id: "d9999999-9999-9999-9999-999999999999",
        status: "waiting",
        severity_score: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chief_complaint: null,
        intake_summary: null,
        follow_up_recommendation: null,
        completed_at: null,
        symptoms: null,
        diagnosis: null,
        icd10_code: null,
        transcript: null,
        medications: null,
        doctor_notes: null,
        original_language: null,
        intake_original_transcript: null,
        intake_english_translation: null,
        consult_original_transcript: null,
        consult_english_transcript: null,
      },
      ehr: null,
      profile: {
        id: "a2d21a9a-7a0e-4d43-987a-6eb9df7bcc7a",
        full_name: patient.fullName,
        email: patient.email,
        mobile: patient.mobile,
        dob: patient.dob,
        gender: patient.gender,
        address: patient.address,
        blood_group: patient.bloodGroup,
        height_cm: patient.heightCm,
        weight_kg: patient.weightKg,
        allergies: patient.allergies,
        chronic_conditions: patient.chronic,
        emergency_contact: patient.emergency,
        insurance_provider: patient.insurance,
        insurance_number: patient.insuranceNumber,
        mrn: patient.mrn,
      },
      details: null
    };
  }

  const [{ data: consultation }, { data: ehr }] = await Promise.all([
    supabase.from("consultations").select("*").eq("id", id).maybeSingle(),
    supabase.from("ehr_records").select("*").eq("consultation_id", id).maybeSingle(),
  ]);
  const patientId = consultation?.patient_id as string | undefined;
  const { data: profile } = patientId
    ? await supabase.from("profiles").select("*").eq("id", patientId).maybeSingle()
    : { data: null };
  return { consultation, ehr, profile, details: null };
}
