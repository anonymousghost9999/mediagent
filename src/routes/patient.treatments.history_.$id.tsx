import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getConsultationById } from "@/lib/mediagent/live";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { downloadReportAsPDF } from "@/components/mediagent/im-report-form";
import {
  ArrowLeft, Download, FileText, Pill, ClipboardList, FileCheck2,
  Brain, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Stethoscope,
  Calendar, User, ShieldAlert, Loader2,
} from "lucide-react";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/patient/treatments/history_/$id")({
  component: Page,
  notFoundComponent: () => (
    <div className="p-6"><p>Consultation record not found.</p></div>
  ),
});

function StatusBadge({ finalized }: { finalized: boolean }) {
  return finalized ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-500/15 text-green-700 border border-green-500/30 rounded-full px-3 py-1">
      <CheckCircle2 className="h-3.5 w-3.5" /> Finalized EHR · Doctor Approved
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-500/15 text-amber-700 border border-amber-500/30 rounded-full px-3 py-1">
      <Brain className="h-3.5 w-3.5 animate-pulse" /> AI Pre-Summary · Awaiting Doctor Review
    </span>
  );
}

function PreSummaryPanel({ consultation, profile }: { consultation: any; profile: any }) {
  const [showTranscript, setShowTranscript] = useState(false);

  const intake = useMemo(() => {
    if (!consultation.intake_summary) return null;
    try { return JSON.parse(consultation.intake_summary); } catch { return null; }
  }, [consultation.intake_summary]);

  const severity = consultation.severity_score;
  const severityLabels: Record<number, { label: string; color: string }> = {
    1: { label: "Emergency", color: "text-red-600 bg-red-50 border-red-200" },
    2: { label: "High", color: "text-orange-600 bg-orange-50 border-orange-200" },
    3: { label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" },
    4: { label: "Low", color: "text-blue-600 bg-blue-50 border-blue-200" },
    5: { label: "Routine", color: "text-green-600 bg-green-50 border-green-200" },
  };
  const sev = severityLabels[severity] ?? { label: "Unknown", color: "text-muted-foreground bg-muted border-border" };

  const downloadPreSummaryPDF = () => downloadReportAsPDF({
    title: `AI Pre-Summary · ${consultation.created_at?.slice(0, 10)}`,
    patientName: profile?.full_name ?? "Patient",
    patientMrn: profile?.mrn ?? "—",
    doctor: "Pending Assignment",
    data: {
      chief_complaint: consultation.chief_complaint || intake?.primary_issue || "—",
      diagnosis: intake?.differential_diagnoses?.join(", ") || "Pending doctor review",
      icd10: "—",
      prescription: "—",
      advice: intake?.ai_advice || intake?.temporary_advice || "—",
    },
    extras: {
      "Severity": sev.label,
      "Symptoms": (intake?.symptoms ?? []).join(", ") || "—",
      "Note": "This is an AI-generated pre-summary. Final diagnosis by doctor pending.",
    },
  });

  return (
    <div className="space-y-4">
      {/* Warning notice */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/8 p-4">
        <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
        <div className="text-sm">
          <div className="font-medium text-amber-700 dark:text-amber-400">Awaiting doctor review</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            Your case has been reviewed by MediAgent AI. A doctor has not yet reviewed this consultation. The information below is AI-generated and not a final diagnosis.
          </div>
        </div>
      </div>

      {/* Severity chip */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">AI Triage Severity:</span>
        <span className={`text-xs font-semibold border rounded-full px-3 py-0.5 ${sev.color}`}>{sev.label}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Chief Complaint</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {consultation.chief_complaint || intake?.primary_issue || intake?.english_symptoms || <span className="text-muted-foreground">Not recorded yet</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Reported Symptoms</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {(intake?.symptoms ?? []).length > 0 ? (
              <ul className="space-y-1">
                {(intake.symptoms as string[]).map((s, i) => <li key={i}>• {s}</li>)}
              </ul>
            ) : <span className="text-muted-foreground">No symptoms recorded</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4 text-accent" />AI Differential Diagnoses</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {(intake?.differential_diagnoses ?? []).length > 0 ? (
              <ul className="space-y-1">
                {(intake.differential_diagnoses as string[]).map((d, i) => <li key={i}>• {d}</li>)}
              </ul>
            ) : <span className="text-muted-foreground">Pending</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" />AI Triage Rationale</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {intake?.triage_rationale || intake?.reasoning || "Not available"}
          </CardContent>
        </Card>

        {(intake?.ai_advice || intake?.temporary_advice) && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Temporary AI Advice</CardTitle></CardHeader>
            <CardContent className="text-sm">{intake?.ai_advice || intake?.temporary_advice}</CardContent>
          </Card>
        )}
      </div>

      {/* Transcript toggle */}
      {consultation.intake_summary && (
        <Card>
          <CardHeader
            className="cursor-pointer hover:bg-muted/20"
            onClick={() => setShowTranscript((v) => !v)}
          >
            <CardTitle className="text-base flex items-center justify-between">
              <span>Original Intake Transcript</span>
              {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
          {showTranscript && (
            <CardContent className="text-xs text-muted-foreground font-mono whitespace-pre-wrap bg-muted/30 rounded-b-md max-h-48 overflow-y-auto">
              {intake?.original_transcript || intake?.english_translation || consultation.intake_summary}
            </CardContent>
          )}
        </Card>
      )}

      <Button onClick={downloadPreSummaryPDF} variant="outline" className="w-full sm:w-auto">
        <Download className="h-4 w-4 mr-1.5" />Download Pre-Summary PDF
      </Button>
    </div>
  );
}

function FinalizedEHRPanel({ ehr, consultation, profile }: { ehr: any; consultation: any; profile: any }) {
  const prescriptions = Array.isArray(ehr?.prescriptions)
    ? (ehr.prescriptions as any[]).map((p) =>
        typeof p === "string" ? p : [p.drug || p.name, p.dosage, p.frequency].filter(Boolean).join(" · ")
      )
    : [];

  const procedures = Array.isArray(ehr?.conflict_warnings)
    ? (ehr.conflict_warnings as any[]).map((p) => (typeof p === "string" ? p : p.message)).filter(Boolean)
    : [];

  const safetyAlerts = (() => {
    try {
      const raw = ehr?.safety_alerts;
      if (!raw) return [];
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { return []; }
  })();

  const downloadFinalizedPDF = () => downloadReportAsPDF({
    title: `Finalized EHR · ${consultation.created_at?.slice(0, 10)}`,
    patientName: profile?.full_name ?? "Patient",
    patientMrn: profile?.mrn ?? "—",
    doctor: ehr?.doctor_id?.slice(0, 8) ?? "—",
    data: {
      chief_complaint: consultation.chief_complaint || "—",
      diagnosis: ehr?.diagnosis || "—",
      icd10: (ehr?.icd_10_codes as string[] | undefined)?.[0] || "—",
      prescription: prescriptions.join("; ") || "—",
      advice: ehr?.discharge_summary_url ? `Summary stored at ${ehr.discharge_summary_url}` : "—",
    },
    extras: {
      "Approved": ehr?.approved_at?.slice(0, 10) ?? "—",
      "Procedures / Warnings": procedures.join(", ") || "—",
    },
  });

  return (
    <div className="space-y-4">
      {/* Safety alerts */}
      {safetyAlerts.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <ShieldAlert className="h-4 w-4" /> Drug Safety Alerts
          </div>
          {safetyAlerts.map((a: any, i: number) => (
            <div key={i} className="text-xs text-muted-foreground">• {a.msg || a.description || JSON.stringify(a)}</div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4" />Diagnosis</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="font-medium">{ehr?.diagnosis ?? "—"}</div>
            {(ehr?.icd_10_codes as string[] | undefined)?.[0] && (
              <div className="text-xs font-mono text-muted-foreground">ICD-10: {(ehr.icd_10_codes as string[])[0]}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Pill className="h-4 w-4" />Prescriptions</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {prescriptions.length > 0
              ? prescriptions.map((p, i) => <div key={i}>• {p}</div>)
              : <span className="text-muted-foreground">None prescribed</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Procedures / Warnings</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {procedures.length > 0
              ? procedures.map((p, i) => <div key={i}>• {p}</div>)
              : <span className="text-muted-foreground">None</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />Follow-up</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {ehr?.approved_at
              ? <><span className="text-muted-foreground">Approved: </span>{ehr.approved_at.slice(0, 10)}</>
              : <span className="text-muted-foreground">—</span>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Clinical Notes</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{ehr?.audio_transcript || "—"}</CardContent>
        </Card>
      </div>

      <Button onClick={downloadFinalizedPDF} className="w-full sm:w-auto">
        <Download className="h-4 w-4 mr-1.5" />Download Finalized EHR PDF
      </Button>
    </div>
  );
}

function Page() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["patient-history-detail", id],
    queryFn: async () => getConsultationById(id),
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Loading consultation…
      </div>
    );
  }

  const consultation = data?.consultation;
  const ehr = data?.ehr;
  const profile = data?.profile;
  if (!consultation) throw notFound();

  const isFinalized = !!ehr && !ehr.is_draft;

  const chiefComplaint = (() => {
    const c = (consultation as any).chief_complaint;
    if (c) return c;
    try {
      const p = JSON.parse((consultation as any).intake_summary ?? "");
      return p.primary_issue || p.english_symptoms || "";
    } catch { return ""; }
  })();

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Back */}
      <Button asChild variant="ghost" size="sm">
        <Link to="/patient/treatments/history"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to treatments</Link>
      </Button>

      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="font-mono text-xs text-accent mb-1">{(consultation as any).record_name ?? id.slice(0, 8)}</div>
            <h1 className="text-2xl font-semibold">
              {chiefComplaint || (isFinalized ? ehr?.diagnosis : "Consultation")}
            </h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />{(consultation as any).created_at?.slice(0, 10)}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {profile?.full_name ?? "Patient"}
              </span>
            </div>
          </div>
          <StatusBadge finalized={isFinalized} />
        </div>
      </header>

      {/* Conditional content */}
      {isFinalized ? (
        <FinalizedEHRPanel ehr={ehr} consultation={consultation} profile={profile} />
      ) : (
        <PreSummaryPanel consultation={consultation} profile={profile} />
      )}
    </div>
  );
}
