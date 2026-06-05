import { supabase } from "@/integrations/supabase/client";

type MaybeRow<T> = T | null;

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item));
  return [];
};

const fmtDate = (value?: string | null) => (value ? value.slice(0, 10) : "—");

export async function getPatientProfile(userId: string) {
  const [{ data: profile }, { data: details }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("patient_details").select("*").eq("id", userId).maybeSingle(),
  ]);

  return { profile, details };
}

export async function getPatientConsultations(userId: string) {
  const { data, error } = await supabase
    .from("consultations")
    .select("id,status,severity_score,created_at,updated_at,assigned_doctor_id,hospital_id")
    .eq("patient_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPatientEhrs(consultationIds: string[]) {
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
  const { data, error } = await supabase
    .from("consultations")
    .select("id,patient_id,status,severity_score,created_at,assigned_doctor_id")
    .order("severity_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const consultations = data ?? [];
  const patientIds = consultations.map((row) => row.patient_id).filter(Boolean);
  const { data: profiles } = patientIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", patientIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));
  return consultations.map((row) => ({
    id: row.id,
    patient: nameById.get(row.patient_id) ?? row.patient_id?.slice(0, 8) ?? "Unknown",
    severity: Number(row.severity_score ?? 1),
    complaint: row.status ? `${row.status.replaceAll("_", " ").toLowerCase()} · consultation` : "Live consultation",
    waited: row.created_at ? `${Math.max(1, Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000))}m` : "—",
    created_at: row.created_at,
    patient_id: row.patient_id,
    assigned_doctor_id: row.assigned_doctor_id,
    status: row.status,
  }));
}

export async function getDoctorReviews() {
  const { data, error } = await supabase
    .from("ehr_records")
    .select("id,consultation_id,doctor_id,diagnosis,is_draft,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ehrs = (data ?? []).filter((row) => row.is_draft);
  const consultationIds = ehrs.map((row) => row.consultation_id);
  const { data: consultations } = consultationIds.length
    ? await supabase.from("consultations").select("id,patient_id").in("id", consultationIds)
    : { data: [] };
  const patientIds = (consultations ?? []).map((row) => row.patient_id);
  const { data: profiles } = patientIds.length
    ? await supabase.from("profiles").select("id,full_name").in("id", patientIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((row) => [row.id, row.full_name]));
  const consultById = new Map((consultations ?? []).map((row) => [row.id, row.patient_id]));
  return ehrs.map((row) => ({
    id: String(row.id),
    patient: nameById.get(consultById.get(row.consultation_id)) ?? consultById.get(row.consultation_id)?.slice(0, 8) ?? "Unknown",
    type: row.diagnosis ? "Consultation Report" : "Draft",
    status: row.is_draft ? "PENDING_REVIEW" : "APPROVED",
  }));
}

export async function getDoctorAppointments(doctorId?: string) {
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
  const { data, error } = await supabase.from("profiles").select("id,full_name,mrn,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminUsers() {
  const { data, error } = await supabase.from("profiles").select("id,full_name,email,created_at,role").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminDoctors() {
  const { data, error } = await supabase.from("profiles").select("id,full_name,department,specialization,license_number,role").eq("role", "doctor").order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getHospitals() {
  const { data, error } = await supabase.from("hospitals").select("id,hospital_name,hospital_code,address").order("hospital_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAuditLogs() {
  const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}

export async function getConsultationById(id: string) {
  const [{ data: consultation }, { data: ehr }] = await Promise.all([
    supabase.from("consultations").select("*").eq("id", id).maybeSingle(),
    supabase.from("ehr_records").select("*").eq("consultation_id", id).maybeSingle(),
  ]);
  const patientId = consultation?.patient_id as string | undefined;
  const { data: profile } = patientId
    ? await supabase.from("profiles").select("*").eq("id", patientId).maybeSingle()
    : { data: null };
  const { data: details } = patientId
    ? await supabase.from("patient_details").select("*").eq("id", patientId).maybeSingle()
    : { data: null };
  return { consultation, ehr, profile, details };
}
