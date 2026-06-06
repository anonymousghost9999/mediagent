import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { severityLabel, type Severity, type ReviewStatus } from "@/lib/mediagent/data";
import { StatusPill } from "@/components/mediagent/badges";
import { IMReportForm, downloadReportAsPDF } from "@/components/mediagent/im-report-form";
import { logAudit, treatmentStatuses, treatmentStatusLabel, type TreatmentStatus } from "@/lib/mediagent/store";
import { getConsultationById } from "@/lib/mediagent/live";
import type { IMReportData } from "@/lib/mediagent/im-report";
import { startConsultation, transcribeConsultation, extractTextConsultation, approveConsultation, getSessionSummary, fetchHpiSummary, type SessionSummary } from "@/lib/api/client";
import {
  AlertTriangle, Check, Pencil, X, ShieldCheck, Mic, MicOff, Save, Download, FileText, Loader2,
  Activity, Brain, ListChecks, User, Flag, Stethoscope, ClipboardList, Clock, Pill,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/doctor/consultations/$id")({ component: Page });


function Page() {
  const { id } = Route.useParams();
  const { data } = useQuery({
    queryKey: ["doctor-consultation", id],
    queryFn: async () => getConsultationById(id),
  });
  const currentPatient = {
    fullName: data?.profile?.full_name ?? "—",
    mrn: data?.profile?.mrn ?? "—",
    age: data?.profile?.dob ? Math.max(0, new Date().getFullYear() - new Date(data.profile.dob).getFullYear()) : null,
    gender: (data?.profile as any)?.gender ?? "—",
    bloodGroup: (data?.profile as any)?.blood_group ?? "—",
    allergies: ((data?.profile as any)?.allergies as string[] | undefined) ?? [],
    chronic: ((data?.profile as any)?.chronic_conditions as string[] | undefined) ?? [],
    currentMeds: ((data?.profile as any)?.current_meds as string[] | undefined) ?? [],
  };

  // Parse patient agent intake report from Supabase
  const intakeSummaryRaw = (data?.consultation as any)?.intake_summary;
  const intakeReport = useMemo(() => {
    if (!intakeSummaryRaw) return null;
    try { return JSON.parse(intakeSummaryRaw); } catch { return null; }
  }, [intakeSummaryRaw]);
  const intakeAvailable = !!intakeReport;

  // AI review state
  const [fields, setFields] = useState<{id:string;label:string;ai:string;status:ReviewStatus;confidence:number}[]>([
    { id: "f1", label: "Suggested Diagnosis", ai: "", status: "PENDING_REVIEW", confidence: 0 },
    { id: "f2", label: "Suggested Prescription", ai: "", status: "PENDING_REVIEW", confidence: 0 },
    { id: "f3", label: "Follow-Up Plan", ai: "", status: "PENDING_REVIEW", confidence: 0 },
    { id: "f4", label: "Tests Ordered", ai: "", status: "PENDING_REVIEW", confidence: 0 },
  ]);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});



  // Voice transcription
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);

  // Doctor analysis / prescription
  const [analysis, setAnalysis] = useState({
    analysis: "",
    diagnosis: "",
    prescription: "",
    clinicalNotes: "",
  });

  // IM report
  const [report, setReport] = useState<IMReportData>({
    chief_complaint: "",
    severity: "",
  });

  // Treatment status
  const [status, setStatus] = useState<TreatmentStatus>("TREATMENT_ONGOING");
  const [followUp, setFollowUp] = useState("");

  const [liveConsultationOutput, setLiveConsultationOutput] = useState<any>(null);
  const [liveSafetyAlerts, setLiveSafetyAlerts] = useState<any[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const liveTranscriptRef = useRef<string[]>([]);  // accumulates final lines for backend
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

  // Auto-fill IM Report Subjective section from patient agent intake report
  useEffect(() => {
    if (!intakeReport) return;

    // chief_complaint: primary issue reported by patient
    const complaint = intakeReport.primary_issue
      || intakeReport.english_translation
      || (data?.consultation as any)?.chief_complaint
      || "";

    // severity: map ESI score (1–5) to IM report radio option string
    const severityMap: Record<number, string> = {
      1: "1 Routine", 2: "2 Low", 3: "3 Medium", 4: "4 High", 5: "5 Emergency",
    };
    const score = typeof intakeReport.severity_score === "number" ? intakeReport.severity_score : 3;
    const severityVal = severityMap[score] ?? "3 Medium";

    // onset: derive from duration text heuristics
    let onset = "";
    const dur: string = (intakeReport.duration || "").toLowerCase();
    if (dur.includes("sudden") || dur.includes("acute") || dur.includes("hour")) onset = "Sudden";
    else if (dur.includes("day") || dur.includes("week")) onset = "Gradual";
    else if (dur.includes("recur") || dur.includes("episod")) onset = "Recurrent";
    else if (dur.includes("month") || dur.includes("year") || dur.includes("chronic")) onset = "Chronic";

    // Fill non-HPI fields immediately
    setReport((prev) => ({
      ...prev,
      ...(complaint && !prev.chief_complaint ? { chief_complaint: complaint } : {}),
      ...(!prev.severity ? { severity: severityVal } : {}),
      ...(onset && !prev.onset ? { onset } : {}),
      // Placeholder while LLM generates HPI
      ...(!prev.hpi ? { hpi: "Generating clinical summary…" } : {}),
    }));

    // Fetch LLM-generated HPI from backend (async, non-blocking)
    fetchHpiSummary(intakeReport as Record<string, unknown>)
      .then((hpi) => {
        if (hpi) {
          setReport((prev) => ({
            ...prev,
            hpi,
          }));
        }
      })
      .catch((err) => {
        console.warn("[HPI] Failed to generate LLM summary, leaving placeholder:", err);
        // Replace placeholder with symptom list fallback
        const symptoms: string[] = intakeReport.symptoms ?? intakeReport.identified_symptoms ?? [];
        const fallback = symptoms.length > 0
          ? `Patient reports ${complaint || symptoms.join(", ")}.`
          : (complaint || "");
        if (fallback) {
          setReport((prev) => ({ ...prev, hpi: fallback }));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intakeReport]);


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

  const toggleRecording = () => {
    if (recording) {
      // ── Stop live transcription ──────────────────────────────────────────
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setRecording(false);
      logAudit({ actor: "Dr. Mehta", action: "TRANSCRIPTION_STOPPED", entity: `consultation:${id}` });
      // Send accumulated transcript text to backend for clinical extraction
      const fullText = liveTranscriptRef.current.join("\n");
      if (fullText.trim().length > 0) {
        toast.info("Consultation ended. Extracting clinical facts...");
        processLiveTranscript(fullText);
      } else {
        toast.warning("No speech was captured during this session.");
      }
    } else {
      // ── Start live transcription via Web Speech API ───────────────────────
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Live transcription not supported in this browser. Use Chrome or Edge.");
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognitionRef.current = recognition;
      liveTranscriptRef.current = [];

      let interimLine = "";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const line = text.trim();
            if (line) {
              liveTranscriptRef.current.push(line);
              setTranscript((prev) => {
                const filtered = prev.filter((l) => !l.startsWith("…"));
                return [...filtered, line];
              });
            }
          } else {
            interim = text;
          }
        }
        if (interim) {
          setTranscript((prev) => {
            const filtered = prev.filter((l) => !l.startsWith("…"));
            return [...filtered, `… ${interim}`];
          });
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "no-speech") return; // ignore silence gaps
        if (event.error === "not-allowed") {
          toast.error("Microphone permission denied.");
          setRecording(false);
        }
      };

      recognition.onend = () => {
        // Auto-restart if still in recording mode (handles browser auto-stop after silence)
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (_) {}
        }
      };

      // Clear placeholder transcript on first real start
      setTranscript([]);
      liveTranscriptRef.current = [];
      recognition.start();
      setRecording(true);
      logAudit({ actor: "Dr. Mehta", action: "TRANSCRIPTION_STARTED", entity: `consultation:${id}` });
      toast.success("Live transcription started", { description: "Speak clearly — transcript updates in real-time." });
    }
  };

  const processLiveTranscript = async (fullText: string) => {
    setTranscribing(true);
    const toastId = toast.loading("Extracting clinical facts from transcript...");
    try {
      const res = await extractTextConsultation(id, fullText);
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
        if (f.id === "f3") {
          const fu = res.follow_up;
          let followUpStr = "No follow-up discussed.";
          if (fu) {
            followUpStr = fu.timing || "";
            if (fu.conditions) followUpStr += ` · Return earlier if: ${fu.conditions}`;
            if (fu.instructions) followUpStr += ` · ${fu.instructions}`;
          }
          return {
            ...f,
            ai: followUpStr,
            status: "PENDING_REVIEW"
          };
        }
        if (f.id === "f4") {
          const items = res.tests_and_investigations ?? res.tests_ordered ?? [];
          const testsStr = items.length > 0
            ? items.map((t: any) => {
                const badge = t.type === "performed" ? "[Performed]" : "[Ordered]";
                return t.result ? `${badge} ${t.name}: ${t.result}` : `${badge} ${t.name}`;
              }).join("; ")
            : "No tests or investigations recorded.";
          return {
            ...f,
            ai: testsStr,
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
  const hasCritical = (liveSafetyAlerts).some(
    (a) => (a.level as string).toUpperCase() === "CRITICAL"
  );

  const finalize = async () => {
    const toastId = toast.loading("Persisting EHR & performing clinical safety audit...");
    try {
      const intakeData = localStorage.getItem(`mediagent_report_${id}`);
      const intakeReportParsed = intakeData ? JSON.parse(intakeData) : {
        original_language: "en-IN",
        original_transcript: data?.consultation?.chief_complaint || "",
        english_translation: data?.consultation?.chief_complaint || "",
        agent_response_english: data?.consultation?.intake_summary || "",
        agent_response_translated: data?.consultation?.intake_summary || "",
        severity_score: data?.consultation?.severity_score ?? 3
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
        symptoms: data?.consultation?.symptoms ?? []
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
          chief_complaint: data?.consultation?.chief_complaint || intakeReport?.primary_issue || "",
          severity: `${data?.consultation?.severity_score ?? 3} ${severityLabel[(data?.consultation?.severity_score ?? 3) as Severity] || "Medium"}`
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
              {recording ? <><MicOff className="h-3.5 w-3.5 mr-1.5" />Stop &amp; Extract</> : <><Mic className="h-3.5 w-3.5 mr-1.5" />Start Listening</>}
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
                {currentPatient.age !== null ? `${currentPatient.age}y` : "Age unknown"} · {currentPatient.gender} · Blood Group: {currentPatient.bloodGroup}
              </div>
            </div>
            
            <div className="flex gap-4 flex-wrap text-xs">
              <div className="bg-background/80 border p-2 rounded min-w-[150px]">
                <div className="text-[10px] uppercase font-mono text-muted-foreground">Allergies</div>
                <div className="font-medium text-destructive">{currentPatient.allergies.length > 0 ? currentPatient.allergies.join(", ") : "None reported"}</div>
              </div>
              <div className="bg-background/80 border p-2 rounded min-w-[150px]">
                <div className="text-[10px] uppercase font-mono text-muted-foreground">Chronic Conditions</div>
                <div className="font-medium text-foreground">{currentPatient.chronic.length > 0 ? currentPatient.chronic.join(", ") : "None"}</div>
              </div>
              <div className="bg-background/80 border p-2 rounded min-w-[150px]">
                <div className="text-[10px] uppercase font-mono text-muted-foreground">Current Medications</div>
                <div className="font-medium text-foreground">{currentPatient.currentMeds.length > 0 ? currentPatient.currentMeds.join(", ") : "None"}</div>
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


        {/* Transcript */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Live transcript</CardTitle>
            <span className={`chip ${recording ? "bg-destructive/15 text-foreground border border-destructive/40" : "bg-muted text-muted-foreground"}`}>
              {recording ? "● Recording" : transcribing ? "● Processing" : "Paused"}
            </span>
          </CardHeader>
          <CardContent className="text-sm space-y-1 max-h-72 overflow-auto font-mono text-xs scroll-smooth">
            {transcribing ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Extracting clinical facts from transcript…
              </div>
            ) : transcript.length === 0 && recording ? (
              <div className="flex items-center gap-2 py-4 text-muted-foreground">
                <span className="animate-pulse text-accent">●</span>
                Listening… speak clearly into your microphone.
              </div>
            ) : transcript.length === 0 ? (
              <div className="py-4 text-muted-foreground italic">No transcript yet. Press “Start Listening” to begin.</div>
            ) : (
              transcript.map((line, i) => {
                const isInterim = line.startsWith("…");
                const isDoc = line.toUpperCase().startsWith("DOCTOR");
                return (
                  <div
                    key={i}
                    className={`leading-relaxed ${isInterim ? "text-muted-foreground/60 italic" : isDoc ? "text-accent" : "text-foreground"}`}
                  >
                    {line}
                  </div>
                );
              })
            )}
            <div className="pt-1 text-muted-foreground/50 italic text-[10px]">
              [Web Speech API · {recording ? "● Live — streaming" : transcribing ? "⏳ Extracting" : "Idle"}]
            </div>
          </CardContent>
        </Card>

        {/* ── Consultation Extraction Results (separate cards per section) ────── */}
        {(sessionSummary || summaryLoading || liveConsultationOutput) && (
          <div className="space-y-3">
            {/* Section header */}
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">Consultation Extraction</h3>
              {summaryLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>

            {/* Grid of detail cards */}
            <div className="grid gap-3 md:grid-cols-2">

              {/* Clinical Overview */}
              {sessionSummary?.overview && (
                <Card className="md:col-span-2 border-accent/20">
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <Brain className="h-3.5 w-3.5 text-accent shrink-0" />
                    <CardTitle className="text-sm font-semibold">Clinical Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <p className="text-sm text-foreground leading-relaxed">{sessionSummary.overview}</p>
                  </CardContent>
                </Card>
              )}

              {/* Symptoms */}
              {liveConsultationOutput?.symptoms?.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <Activity className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <CardTitle className="text-sm font-semibold">Symptoms</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <ul className="space-y-1">
                      {liveConsultationOutput.symptoms.map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-orange-400 mt-1.5 shrink-0" />{s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Diagnosis */}
              {liveConsultationOutput?.diagnosis && (
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <Stethoscope className="h-3.5 w-3.5 text-primary shrink-0" />
                    <CardTitle className="text-sm font-semibold">Diagnosis</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 space-y-1">
                    <p className="text-sm font-medium">{liveConsultationOutput.diagnosis}</p>
                    {liveConsultationOutput.icd10_code && (
                      <p className="text-xs font-mono text-muted-foreground bg-muted inline-block px-2 py-0.5 rounded">
                        ICD-10: {liveConsultationOutput.icd10_code}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Prescribed Medications */}
              {liveConsultationOutput?.prescribed_drugs?.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <Pill className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <CardTitle className="text-sm font-semibold">Prescribed Medications</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="space-y-2">
                      {liveConsultationOutput.prescribed_drugs.map((d: any, i: number) => (
                        <div key={i} className="text-xs bg-muted/50 rounded p-2">
                          <div className="font-semibold text-foreground">{d.name}</div>
                          <div className="text-muted-foreground mt-0.5">
                            {[d.dosage, d.frequency, d.duration && `for ${d.duration}`].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Tests & Investigations */}
              <Card className={(liveConsultationOutput?.tests_and_investigations?.length ?? liveConsultationOutput?.tests_ordered?.length ?? 0) > 0 ? "" : "border-dashed"}>
                <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                  <FileText className="h-3.5 w-3.5 text-accent shrink-0" />
                  <CardTitle className="text-sm font-semibold">Tests &amp; Investigations</CardTitle>
                  {(liveConsultationOutput?.tests_and_investigations?.length ?? liveConsultationOutput?.tests_ordered?.length ?? 0) === 0 && liveConsultationOutput && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">None recorded</span>
                  )}
                </CardHeader>
                {(liveConsultationOutput?.tests_and_investigations?.length > 0 || liveConsultationOutput?.tests_ordered?.length > 0) && (
                  <CardContent className="px-4 pb-4 pt-0">
                    <div className="space-y-2">
                      {(liveConsultationOutput?.tests_and_investigations ?? liveConsultationOutput?.tests_ordered ?? []).map((t: any, i: number) => (
                        <div key={i} className="text-xs bg-muted/50 rounded p-2 flex items-start gap-2">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                            t.type === "performed"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-accent/15 text-accent"
                          }`}>
                            {t.type === "performed" ? "Performed" : "Ordered"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-foreground">{t.name}</div>
                            {t.result
                              ? <div className="text-green-700 mt-0.5">Finding: {t.result}</div>
                              : <div className="text-muted-foreground italic mt-0.5">{t.type === "performed" ? "No finding recorded" : "Result pending"}</div>
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>

              {/* Follow-Up Plan */}
              {liveConsultationOutput?.follow_up && (
                <Card className="border-primary/25 bg-primary/5">
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                    <CardTitle className="text-sm font-semibold">Follow-Up Plan</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 space-y-1.5 text-xs">
                    {liveConsultationOutput.follow_up.timing && (
                      <div><span className="font-medium text-foreground">Return timing: </span>{liveConsultationOutput.follow_up.timing}</div>
                    )}
                    {liveConsultationOutput.follow_up.conditions && (
                      <div><span className="font-medium text-foreground">Return earlier if: </span>{liveConsultationOutput.follow_up.conditions}</div>
                    )}
                    {liveConsultationOutput.follow_up.instructions && (
                      <div><span className="font-medium text-foreground">Instructions: </span>{liveConsultationOutput.follow_up.instructions}</div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Patient Instructions */}
              {sessionSummary?.patient_instructions?.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <CardTitle className="text-sm font-semibold">Patient Instructions</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <ul className="space-y-1">
                      {sessionSummary.patient_instructions.map((p, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />{p}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Action Items */}
              {sessionSummary?.action_items?.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <ListChecks className="h-3.5 w-3.5 text-accent shrink-0" />
                    <CardTitle className="text-sm font-semibold">Action Items</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <ul className="space-y-1">
                      {sessionSummary.action_items.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />{a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Risk Flags */}
              {sessionSummary?.risk_flags?.length > 0 && (
                <Card className="md:col-span-2 border-destructive/30 bg-destructive/5">
                  <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
                    <Flag className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <CardTitle className="text-sm font-semibold text-destructive">Risk Flags</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0">
                    <ul className="space-y-1">
                      {sessionSummary.risk_flags.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{r}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

            </div>
          </div>
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
                  patientName: currentPatient.fullName,
                  patientMrn: currentPatient.mrn,
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
          {(liveSafetyAlerts).map((a, i) => (
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
