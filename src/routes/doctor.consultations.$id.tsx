import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiFields, safetyAlerts, patient, timeline, severityLabel, type Severity } from "@/lib/mediagent/data";
import { StatusPill, DraftBadge } from "@/components/mediagent/badges";
import { IMReportForm, downloadReportAsPDF } from "@/components/mediagent/im-report-form";
import { logAudit, treatmentStatuses, treatmentStatusLabel, type TreatmentStatus } from "@/lib/mediagent/store";
import { getConsultationById } from "@/lib/mediagent/live";
import type { IMReportData } from "@/lib/mediagent/im-report";
import { startConsultation, transcribeConsultation, approveConsultation, getSessionSummary, type SessionSummary } from "@/lib/api/client";
import {
  AlertTriangle, Check, Pencil, X, ShieldCheck, Mic, MicOff, Save, Download, FileText, Loader2,
  Activity, Brain, ListChecks, User, Flag, Stethoscope, ClipboardList, Clock, Pill,
} from "lucide-react";
import { toast } from "sonner";
import type { ReviewStatus } from "@/lib/mediagent/data";

export const Route = createFileRoute("/doctor/consultations/$id")({ component: Page });

const initialPre = {
  chiefComplaint: "Wheezing & cough × 2 days, worse at night. Slight exertional dyspnea. No fever.",
  severity: "3",
  patientReports: "Inhaler use inconsistent. No ER visits.",
};

function Page() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["doctor-consultation", id],
    queryFn: async () => getConsultationById(id),
  });
  const currentPatient = data?.profile ? {
    fullName: data.profile.full_name ?? patient.fullName,
    mrn: data.profile.mrn ?? patient.mrn,
    age: data.profile.dob ? Math.max(0, new Date().getFullYear() - new Date(data.profile.dob).getFullYear()) : patient.age,
    gender: (data.details as any)?.gender ?? (data.profile as any)?.gender ?? patient.gender,
    bloodGroup: (data.profile as any)?.blood_group ?? (data.details as any)?.blood_group ?? patient.bloodGroup,
    bp: patient.bp,
    bloodSugar: patient.bloodSugar,
    allergies: ((data.details as any)?.known_allergies as string[] | undefined) ?? patient.allergies,
    chronic: ((data.details as any)?.chronic_conditions as string[] | undefined) ?? patient.chronic,
    currentMeds: ((data.profile as any)?.current_meds as string[] | undefined) ?? patient.currentMeds,
  } : patient;

  // Parse patient agent intake report from Supabase
  const intakeSummaryRaw = (data?.consultation as any)?.intake_summary;
  const intakeReport = (() => {
    if (!intakeSummaryRaw) return null;
    try { return JSON.parse(intakeSummaryRaw); } catch { return null; }
  })();
  const intakeAvailable = !!intakeReport;

  // AI review state
  const [fields, setFields] = useState(aiFields);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Pre-consultation editing
  const [pre, setPre] = useState(initialPre);
  const [preEditing, setPreEditing] = useState(false);
  const [preDraft, setPreDraft] = useState(initialPre);

  // Voice transcription
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([
    "DOCTOR: Tell me when this started.",
    "PATIENT: About two days ago, after the dust storm.",
    "DOCTOR: Have you used the rescue inhaler?",
    "PATIENT: Yes, three times yesterday.",
  ]);

  // Doctor analysis / prescription
  const [analysis, setAnalysis] = useState({
    analysis: "",
    diagnosis: "",
    prescription: "",
    clinicalNotes: "",
  });

  // IM report
  const [report, setReport] = useState<IMReportData>({
    chief_complaint: initialPre.chiefComplaint,
    severity: "3 Medium",
  });

  // Treatment status
  const [status, setStatus] = useState<TreatmentStatus>("TREATMENT_ONGOING");
  const [followUp, setFollowUp] = useState("");

  const [liveConsultationOutput, setLiveConsultationOutput] = useState<any>(null);
  const [liveSafetyAlerts, setLiveSafetyAlerts] = useState<any[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const hasStartedRef = useRef(false);

  // Trigger startConsultation on first mount only (guarded with ref to prevent re-calls on re-render)
  useEffect(() => {
    async function initConsult() {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      try {
        await startConsultation(id);
      } catch (err) {
        // Patient may not exist in DB yet (e.g. mock queue patient) — safe to ignore
        console.error("Failed to signal consultation start to backend:", err);
      }
    }
    initConsult();

  }, [id]);

  useEffect(() => {
    if (data?.consultation) {
      setPre({
        chiefComplaint: data.consultation.chief_complaint || data.consultation.intake_english_translation || "No symptoms captured",
        severity: String(data.consultation.severity_score ?? 3),
        patientReports: data.consultation.intake_summary || data.consultation.intake_english_translation || "No prior guidance",
      });
      return;
    }

    const stored = localStorage.getItem(`mediagent_report_${id}`);
    if (stored) {
      try {
        const reportData = JSON.parse(stored);
        setPre({
          chiefComplaint: reportData.english_translation || "No symptoms captured",
          // Store the raw ESI score (1 = most critical, 5 = least urgent) directly — no inversion
          severity: String(reportData.severity_score ?? 3),
          patientReports: reportData.agent_response_english || "No prior guidance",
        });
      } catch (err) {
        console.error("Failed to parse stored report for pre-consultation", err);
      }
    }
  }, [id, data]);

  const updateField = (fid: string, st: ReviewStatus, edit?: string) => {
    setFields((fs) => fs.map((f) => (f.id === fid ? { ...f, status: st, ai: edit ?? f.ai } : f)));
    setEditing(null);
    logAudit({
      actor: "Dr. Mehta",
      action: `AI_FIELD_${st}`,
      entity: `consultation:${id}/field:${fid}`,
      after: edit,
    });
  };

  const savePre = () => {
    logAudit({
      actor: "Dr. Mehta",
      action: "PRECONSULT_EDITED",
      entity: `consultation:${id}`,
      before: pre,
      after: preDraft,
      note: "Edited after direct confirmation with patient.",
    });
    setPre(preDraft);
    setPreEditing(false);
    toast.success("Pre-consultation updated", { description: "Change recorded in audit log." });
  };

  const toggleRecording = async () => {
    if (recording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      setRecording(false);
      logAudit({ actor: "Dr. Mehta", action: "TRANSCRIPTION_STOPPED", entity: `consultation:${id}` });
      toast.info("Voice transcription stopped. Processing recording...");
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
          await uploadConsultationAudio(audioBlob);
        };

        mediaRecorder.start();
        setRecording(true);
        logAudit({ actor: "Dr. Mehta", action: "TRANSCRIPTION_STARTED", entity: `consultation:${id}` });
        toast.success("Voice transcription started", { description: "Listening to consultation…" });
      } catch (err) {
        console.error("Mic access failed", err);
        toast.error("Microphone access failed.");
      }
    }
  };

  const uploadConsultationAudio = async (audioBlob: Blob) => {
    setTranscribing(true);
    const toastId = toast.loading("Transcribing and extracting clinical facts...");
    try {
      const formData = new FormData();
      formData.append("patient_id", id);
      formData.append("audio_file", audioBlob, "consultation.wav");

      const res = await transcribeConsultation(formData);
      setLiveConsultationOutput(res);

      toast.success("Dialogue transcribed and clinical summary extracted!", { id: toastId });

      if (res.raw_transcript) {
        setTranscript(res.raw_transcript.split("\n"));
      } else {
        setTranscript([
          `PATIENT: [Translated Speech Dialogue]`,
          res.english_transcript || "Consultation complete."
        ]);
      }

      setFields((fs) => fs.map((f) => {
        if (f.id === "f1") {
          return {
            ...f,
            ai: `${res.diagnosis || "Undiagnosed"} (${res.icd10_code || "J03.90"})`,
            status: "PENDING_REVIEW"
          };
        }
        if (f.id === "f2") {
          const medsStr = res.prescribed_drugs && res.prescribed_drugs.length > 0
            ? res.prescribed_drugs.map((d: any) => `${d.name} ${d.dosage} - ${d.frequency} for ${d.duration}`).join("; ")
            : "No medications prescribed";
          return {
            ...f,
            ai: medsStr,
            status: "PENDING_REVIEW"
          };
        }
        return f;
      }));

      // Fetch session summary from agent in background
      const fullTranscript = res.raw_transcript || res.english_transcript || transcript.join("\n");
      setSummaryLoading(true);
      getSessionSummary(fullTranscript, {
        symptoms: res.symptoms,
        diagnosis: res.diagnosis,
        icd10_code: res.icd10_code,
        prescribed_drugs: res.prescribed_drugs,
      }).then((s) => {
        setSessionSummary(s);
        toast.info("Session summary ready", { description: "AI has generated a structured summary below the transcript." });
      }).catch((err) => {
        console.error("Session summary failed:", err);
      }).finally(() => setSummaryLoading(false));

    } catch (err) {
      console.error(err);
      toast.error("Failed to transcribe dialogue. Using mockup fallbacks.", { id: toastId });
    } finally {
      setTranscribing(false);
    }
  };

  const saveAnalysis = () => {
    logAudit({
      actor: "Dr. Mehta",
      action: "DOCTOR_ANALYSIS_SAVED",
      entity: `consultation:${id}`,
      after: analysis,
    });
    toast.success("Doctor analysis saved");
  };

  const allApproved = fields.every((f) => f.status === "APPROVED" || f.status === "MODIFIED_AND_APPROVED");
  const hasCritical = (liveSafetyAlerts.length > 0 ? liveSafetyAlerts : safetyAlerts).some(
    (a) => (a.level as string).toUpperCase() === "CRITICAL"
  );

  const finalize = async () => {
    const toastId = toast.loading("Persisting EHR & performing clinical safety audit...");
    try {
      const intakeData = localStorage.getItem(`mediagent_report_${id}`);
      const intakeReportParsed = intakeData ? JSON.parse(intakeData) : {
        original_language: "en-IN",
        original_transcript: pre.chiefComplaint,
        english_translation: pre.chiefComplaint,
        agent_response_english: pre.patientReports,
        agent_response_translated: pre.patientReports,
        // pre.severity is now the raw ESI score — use it directly
        severity_score: Number(pre.severity)
      };

      const diagnosisField = fields.find((f) => f.id === "f1")?.ai || "";
      const prescriptionField = fields.find((f) => f.id === "f2")?.ai || "";
      const followUpField = fields.find((f) => f.id === "f3")?.ai || "";

      const diagParts = diagnosisField.match(/(.+?)\s*\((.+?)\)/) || [null, diagnosisField, "I20.9"];
      const diagnosisText = diagParts[1]?.trim() || diagnosisField;
      const icd10Text = diagParts[2]?.trim() || "I20.9";

      const parsedMeds = prescriptionField.split(";").map((medStr) => {
        const trimmed = medStr.trim();
        const parts = trimmed.split(" ");
        const name = parts[0] || "Medication";
        return {
          name,
          dosage: parts[1] || "500mg",
          frequency: parts.slice(2).join(" ") || "As directed",
          duration: "5 days"
        };
      });

      const consultationOutputParsed = liveConsultationOutput || {
        raw_transcript: transcript.join("\n"),
        english_transcript: transcript.join("\n"),
        diagnosis: diagnosisText,
        icd10_code: icd10Text,
        prescribed_drugs: parsedMeds,
        symptoms: [pre.chiefComplaint]
      };

      const res = await approveConsultation({
        patient_id: id,
        patient_intake_output: intakeReportParsed,
        consultation_output: consultationOutputParsed,
        doctor_edits: {
          diagnosis: diagnosisText,
          icd10_code: icd10Text,
          prescribed_drugs: parsedMeds,
          doctor_notes: analysis.clinicalNotes
        }
      });

      toast.success("EHR finalized and verified!", { id: toastId });

      if (res.safety_audit) {
        const audit = res.safety_audit;
        if (audit.has_conflict) {
          setLiveSafetyAlerts([{ level: audit.severity, msg: audit.description }]);
          toast.warning(`Safety Conflict Alert: [${audit.severity}] - ${audit.description}`, { duration: 15000 });
        } else {
          setLiveSafetyAlerts([{ level: "LOW", msg: "No drug safety conflicts or allergy alerts found." }]);
        }
      }

      downloadReportAsPDF({
        title: `Finalized Consultation Report · ${id}`,
        patientName: currentPatient.fullName,
        patientMrn: currentPatient.mrn,
        doctor: "Dr. R. Mehta",
        data: {
          chief_complaint: pre.chiefComplaint,
          severity: `${pre.severity} ${severityLabel[Number(pre.severity) as Severity] || "Medium"}`
        },
        extras: {
          "Doctor analysis": analysis.analysis || "Approved pre-consultation summary",
          "Diagnosis": `${diagnosisText} (${icd10Text})`,
          "Prescription": prescriptionField,
          "Clinical notes": analysis.clinicalNotes || "No notes",
          "Treatment status": treatmentStatusLabel[status],
          "Follow-up": followUpField || "Review as scheduled",
          "Bilingual Discharge (Sarvam)": res.translated_discharge || "No translation",
          "Insurance Pre-auth Status": res.insurance_preauth?.preauth_status || "Pending review"
        },
      });

      logAudit({
        actor: "Dr. Mehta",
        action: "EHR_FINALIZED",
        entity: `consultation:${id}`,
        after: res
      });

    } catch (err) {
      console.error(err);
      toast.error("Failed to finalize EHR with backend. Using local PDF fallback.", { id: toastId });
      
      downloadReportAsPDF({
        title: `Consultation Report (Fallback) · ${id}`,
        patientName: currentPatient.fullName,
        patientMrn: currentPatient.mrn,
        doctor: "Dr. R. Mehta",
        data: report,
        extras: {
          "Doctor analysis": analysis.analysis || "—",
          "Diagnosis": analysis.diagnosis || "—",
          "Prescription": analysis.prescription || "—",
          "Clinical notes": analysis.clinicalNotes || "—",
          "Treatment status": treatmentStatusLabel[status],
          "Follow-up": followUp || "—",
        },
      });
    }
  };

  return (
    <div className="p-6 grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Center column */}
      <div className="space-y-3 min-w-0">
        <header className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Consultation {id}</div>
            <h1 className="text-2xl font-semibold">Workspace</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status="CONSULTATION_ACTIVE" />
            {/* Live recording status indicator */}
            {recording && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-destructive bg-destructive/10 border border-destructive/30 px-2 py-1 rounded-full animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block" />
                LIVE · Agent Listening
              </div>
            )}
            {transcribing && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-accent bg-accent/10 border border-accent/30 px-2 py-1 rounded-full">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processing…
              </div>
            )}
            {summaryLoading && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded-full">
                <Brain className="h-3 w-3 animate-pulse" />
                Summarising…
              </div>
            )}
            <Button
              size="sm"
              variant={recording ? "destructive" : "default"}
              onClick={toggleRecording}
              disabled={transcribing}
            >
              {recording ? <><MicOff className="h-3.5 w-3.5 mr-1.5" />Stop transcription</> : <><Mic className="h-3.5 w-3.5 mr-1.5" />Start voice transcription</>}
            </Button>
          </div>
        </header>

        {/* Patient Details Banner */}
        <Card className="p-4 border-accent/20 bg-accent-soft/20">
          <div className="flex flex-wrap gap-6 items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs uppercase font-mono tracking-wider text-muted-foreground">Patient Profile</div>
              <div className="text-lg font-bold text-foreground flex items-center gap-2">
                {currentPatient.fullName}
                <span className="text-xs font-mono font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">{currentPatient.mrn}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {currentPatient.age}y · {currentPatient.gender} · Blood Group: {currentPatient.bloodGroup} · BP: {currentPatient.bp} · Sugar: {currentPatient.bloodSugar}
              </div>
            </div>
            
            <div className="flex gap-4 flex-wrap text-xs">
              <div className="bg-background/80 border p-2 rounded min-w-[150px]">
                <div className="text-[10px] uppercase font-mono text-muted-foreground">Allergies</div>
                <div className="font-medium text-destructive">{currentPatient.allergies.join(", ")}</div>
              </div>
              <div className="bg-background/80 border p-2 rounded min-w-[150px]">
                <div className="text-[10px] uppercase font-mono text-muted-foreground">Chronic Conditions</div>
                <div className="font-medium text-foreground">{currentPatient.chronic.join(", ")}</div>
              </div>
              <div className="bg-background/80 border p-2 rounded min-w-[150px]">
                <div className="text-[10px] uppercase font-mono text-muted-foreground">Current Medications</div>
                <div className="font-medium text-foreground">{currentPatient.currentMeds.join(", ")}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Patient Agent Report */}
        <Card className={intakeAvailable ? "border-primary/20 bg-primary/5" : "border-dashed"}>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Patient Agent Report</CardTitle>
            {!intakeAvailable && (
              <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                Awaiting intake
              </span>
            )}
          </CardHeader>
          <CardContent>
            {!intakeAvailable ? (
              <p className="text-sm text-muted-foreground italic">
                The patient has not completed their intake yet. This panel will populate automatically once they submit symptoms via the patient portal.
              </p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-3">
                  <div className="bg-background border rounded p-2 min-w-[130px]">
                    <div className="text-[10px] uppercase font-mono text-muted-foreground">ESI Severity</div>
                    <div className={`text-lg font-bold ${intakeReport.severity_score <= 2 ? "text-destructive" : intakeReport.severity_score === 3 ? "text-orange-500" : "text-green-600"}`}>
                      {intakeReport.severity_score ?? "\u2014"} / 5
                    </div>
                  </div>
                  <div className="bg-background border rounded p-2 flex-1 min-w-[200px]">
                    <div className="text-[10px] uppercase font-mono text-muted-foreground">Chief Complaint</div>
                    <div className="font-medium">{intakeReport.primary_issue || (data?.consultation as any)?.chief_complaint || "Not captured"}</div>
                  </div>
                  {intakeReport.organ_system && (
                    <div className="bg-background border rounded p-2 min-w-[120px]">
                      <div className="text-[10px] uppercase font-mono text-muted-foreground">Organ System</div>
                      <div className="font-medium">{intakeReport.organ_system}</div>
                    </div>
                  )}
                </div>
                {(intakeReport.english_symptoms || (intakeReport.symptoms ?? []).length > 0) && (
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1">
                      <Activity className="h-3 w-3" />Reported Symptoms
                    </div>
                    <p className="text-sm">{intakeReport.english_symptoms || (intakeReport.symptoms ?? []).join(", ")}</p>
                    {intakeReport.duration && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />Duration: {intakeReport.duration}
                      </p>
                    )}
                  </div>
                )}
                {intakeReport.differential_diagnoses?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1">
                      <Stethoscope className="h-3 w-3" />Differential Diagnoses (AI)
                    </div>
                    <div className="space-y-1">
                      {intakeReport.differential_diagnoses.slice(0, 4).map((dx: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 ${dx.probability?.toLowerCase() === "high" ? "bg-destructive/15 text-destructive" : dx.probability?.toLowerCase() === "medium" ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                            {dx.probability ?? "?"}
                          </span>
                          <div>
                            <span className="font-medium">{dx.condition}</span>
                            {dx.rationale && <span className="text-muted-foreground"> &mdash; {dx.rationale}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {intakeReport.triage_rationale && (
                  <div>
                    <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1">Triage Rationale</div>
                    <p className="text-xs text-muted-foreground">{intakeReport.triage_rationale}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {intakeReport.allergies && (
                    <div className="bg-destructive/10 rounded p-2">
                      <div className="text-[10px] uppercase font-mono text-muted-foreground">Allergies (Reported)</div>
                      <div className="font-medium text-destructive">{intakeReport.allergies}</div>
                    </div>
                  )}
                  {intakeReport.chronic_diseases && (
                    <div className="bg-background border rounded p-2">
                      <div className="text-[10px] uppercase font-mono text-muted-foreground">Chronic</div>
                      <div className="font-medium">{intakeReport.chronic_diseases}</div>
                    </div>
                  )}
                  {intakeReport.previous_medication && (
                    <div className="bg-background border rounded p-2">
                      <div className="text-[10px] uppercase font-mono text-muted-foreground flex items-center gap-1"><Pill className="h-3 w-3" />Prior Meds</div>
                      <div className="font-medium">{intakeReport.previous_medication}</div>
                    </div>
                  )}
                </div>
                {(data?.consultation as any)?.intake_original_transcript && (
                  <details>
                    <summary className="cursor-pointer text-[10px] uppercase font-mono text-muted-foreground hover:text-foreground">&rsaquo; Patient&apos;s original words</summary>
                    <p className="mt-1 text-xs bg-muted rounded p-2 italic">{(data?.consultation as any)?.intake_original_transcript}</p>
                  </details>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pre-consultation (editable) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Pre-consultation summary</CardTitle>
            {!preEditing ? (
              <Button size="sm" variant="outline" onClick={() => { setPreDraft(pre); setPreEditing(true); }}>
                <Pencil className="h-3 w-3 mr-1" />Edit
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Button size="sm" onClick={savePre}><Save className="h-3 w-3 mr-1" />Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setPreEditing(false)}>Cancel</Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <DraftBadge />
            {!preEditing ? (
              <>
                <p><b>Chief complaint:</b> {pre.chiefComplaint}</p>
                <p><b>Severity (ESI):</b> {pre.severity} / 5</p>
                <p><b>AI Pre-Assessment:</b> {pre.patientReports}</p>
                <p className="text-[11px] text-muted-foreground pt-1">Confirm with the patient before editing. All changes are recorded in the audit log.</p>
              </>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Chief complaint</Label>
                  <Textarea value={preDraft.chiefComplaint} onChange={(e) => setPreDraft({ ...preDraft, chiefComplaint: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Severity (1–5)</Label>
                  <Input value={preDraft.severity} onChange={(e) => setPreDraft({ ...preDraft, severity: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Patient reports</Label>
                  <Textarea value={preDraft.patientReports} onChange={(e) => setPreDraft({ ...preDraft, patientReports: e.target.value })} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transcript */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Live transcript</CardTitle>
            <span className={`chip ${recording ? "bg-destructive/15 text-foreground border border-destructive/40" : "bg-muted text-muted-foreground"}`}>
              {recording ? "● Recording" : transcribing ? "● Processing" : "Paused"}
            </span>
          </CardHeader>
          <CardContent className="text-sm space-y-2 max-h-72 overflow-auto font-mono text-xs">
            {transcribing ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Transcribing recording and extracting medical concepts...
              </div>
            ) : (
              transcript.map((line, i) => {
                const isDoc = line.startsWith("DOCTOR:");
                return (
                  <div key={i}>
                    <span className={isDoc ? "text-accent" : "text-muted-foreground"}>{line.split(":")[0]}:</span>
                    {line.slice(line.indexOf(":") + 1)}
                  </div>
                );
              })
            )}
            <div className="text-muted-foreground italic">
              [Consultation Agent · en · {recording ? "live · confidence 0.94" : "idle"}]
            </div>
          </CardContent>
        </Card>

        {/* Session Summary (populated after transcription) */}
        {(sessionSummary || summaryLoading) && (
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <Brain className="h-4 w-4 text-accent" />
              <CardTitle className="text-base">Agent Session Summary</CardTitle>
              {summaryLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
            </CardHeader>
            {sessionSummary && (
              <CardContent className="space-y-4 text-sm">
                {/* Overview */}
                <div>
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1">Overview</div>
                  <p className="text-sm text-foreground leading-relaxed">{sessionSummary.overview}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {/* Key Findings */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1">
                      <Activity className="h-3 w-3" />Key Findings
                    </div>
                    <ul className="space-y-1">
                      {sessionSummary.key_findings.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <Check className="h-3 w-3 mt-0.5 text-accent shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action Items */}
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1">
                      <ListChecks className="h-3 w-3" />Action Items
                    </div>
                    <ul className="space-y-1">
                      {sessionSummary.action_items.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Patient Instructions */}
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-muted-foreground mb-1">
                    <User className="h-3 w-3" />Patient Instructions
                  </div>
                  <ul className="space-y-1">
                    {sessionSummary.patient_instructions.map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />{p}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Risk Flags */}
                {sessionSummary.risk_flags.length > 0 && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-destructive mb-1">
                      <Flag className="h-3 w-3" />Risk Flags
                    </div>
                    <ul className="space-y-1">
                      {sessionSummary.risk_flags.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* Doctor analysis + IM report tabs */}
        <Tabs defaultValue="analysis">
          <TabsList>
            <TabsTrigger value="analysis">Doctor analysis</TabsTrigger>
            <TabsTrigger value="report">IM Report</TabsTrigger>
            <TabsTrigger value="status">Status & follow-up</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Doctor analysis & prescription</CardTitle>
                <Button size="sm" onClick={saveAnalysis}><Save className="h-3 w-3 mr-1" />Save</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Doctor analysis</Label>
                  <Textarea rows={3} value={analysis.analysis} onChange={(e) => setAnalysis({ ...analysis, analysis: e.target.value })} placeholder="Clinical reasoning, observations…" />
                </div>
                <div>
                  <Label className="text-xs">Diagnosis</Label>
                  <Textarea rows={2} value={analysis.diagnosis} onChange={(e) => setAnalysis({ ...analysis, diagnosis: e.target.value })} placeholder="Primary + differential diagnosis" />
                </div>
                <div>
                  <Label className="text-xs">Prescription</Label>
                  <Textarea rows={3} value={analysis.prescription} onChange={(e) => setAnalysis({ ...analysis, prescription: e.target.value })} placeholder="Drug · dose · frequency · duration" />
                </div>
                <div>
                  <Label className="text-xs">Clinical notes</Label>
                  <Textarea rows={3} value={analysis.clinicalNotes} onChange={(e) => setAnalysis({ ...analysis, clinicalNotes: e.target.value })} placeholder="Notes visible only to clinical team" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="report" className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Dynamic IM Report — fields support text, dropdowns, radios, checkboxes.</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadReportAsPDF({
                  title: `IM Report · ${id}`,
                  patientName: patient.fullName,
                  patientMrn: patient.mrn,
                  doctor: "Dr. R. Mehta",
                  data: report,
                })}
              >
                <Download className="h-3 w-3 mr-1" />Download PDF
              </Button>
            </div>
            <IMReportForm value={report} onChange={setReport} />
          </TabsContent>

          <TabsContent value="status" className="space-y-3">
            <Card>
              <CardHeader><CardTitle className="text-base">Treatment status</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Outcome</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TreatmentStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {treatmentStatuses.map((s) => (
                        <SelectItem key={s} value={s}>{treatmentStatusLabel[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Follow-up recommendation</Label>
                  <Input value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="e.g. Review in 7 days, PEFR diary" />
                </div>
                <p className="text-[11px] text-muted-foreground">Visible to the patient on their dashboard and treatment history.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* AI review panel */}
      <aside className="space-y-3 min-w-0">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">AI review panel</div>
        {fields.map((f) => (
          <Card key={f.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide">{f.label}</div>
              <StatusPill status={f.status} />
            </div>
            {editing === f.id ? (
              <Textarea defaultValue={f.ai} className="text-sm" onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))} />
            ) : (
              <div className="text-sm bg-muted/40 rounded p-2">{f.ai}</div>
            )}
            <div className="text-[10px] font-mono text-muted-foreground">AI confidence {(f.confidence * 100).toFixed(0)}%</div>
            <div className="flex flex-wrap gap-1.5">
              {editing === f.id ? (
                <>
                  <Button size="sm" onClick={() => updateField(f.id, "MODIFIED_AND_APPROVED", drafts[f.id])}><Check className="h-3 w-3 mr-1" />Save & approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="default" onClick={() => updateField(f.id, "APPROVED")}><Check className="h-3 w-3 mr-1" />Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(f.id)}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => updateField(f.id, "REJECTED")}><X className="h-3 w-3 mr-1" />Reject</Button>
                </>
              )}
            </div>
          </Card>
        ))}

        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-accent" /> Medication safety</div>
          {(liveSafetyAlerts.length > 0 ? liveSafetyAlerts : safetyAlerts).map((a, i) => (
            <div key={i} className="text-xs flex gap-2 items-start">
              <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 ${a.level === "HIGH" || a.level === "High" ? "text-destructive" : "text-muted-foreground"}`} />
              <div><b>{a.level}:</b> {a.msg}</div>
            </div>
          ))}
        </Card>

        <Button className="w-full" size="lg" disabled={!allApproved || hasCritical || transcribing} onClick={finalize}>
          Finalize EHR & download PDF
        </Button>
        {!allApproved && <p className="text-[10px] text-muted-foreground text-center">All AI fields must be reviewed before finalization.</p>}
      </aside>
    </div>
  );
}
