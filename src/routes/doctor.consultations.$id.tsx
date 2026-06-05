import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiFields, safetyAlerts, patient, timeline } from "@/lib/mediagent/data";
import { StatusPill, DraftBadge } from "@/components/mediagent/badges";
import { IMReportForm, downloadReportAsPDF } from "@/components/mediagent/im-report-form";
import { logAudit, treatmentStatuses, treatmentStatusLabel, type TreatmentStatus } from "@/lib/mediagent/store";
import { getConsultationById } from "@/lib/mediagent/live";
import type { IMReportData } from "@/lib/mediagent/im-report";
import {
  AlertTriangle, Check, Pencil, X, ShieldCheck, Mic, MicOff, Save, Download, FileText,
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
    gender: data.profile.gender ?? data.details?.gender ?? patient.gender,
    bloodGroup: data.profile.blood_group ?? data.details?.blood_group ?? patient.bloodGroup,
    bp: patient.bp,
    bloodSugar: patient.bloodSugar,
    allergies: (data.details?.known_allergies as string[] | undefined) ?? patient.allergies,
    chronic: (data.details?.chronic_conditions as string[] | undefined) ?? patient.chronic,
    currentMeds: (data.profile.current_meds as string[] | undefined) ?? patient.currentMeds,
  } : patient;

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

  const toggleRecording = () => {
    if (recording) {
      setRecording(false);
      logAudit({ actor: "Dr. Mehta", action: "TRANSCRIPTION_STOPPED", entity: `consultation:${id}` });
      toast.info("Voice transcription stopped");
    } else {
      setRecording(true);
      logAudit({ actor: "Dr. Mehta", action: "TRANSCRIPTION_STARTED", entity: `consultation:${id}` });
      toast.success("Voice transcription started", { description: "Listening to consultation…" });
      // Simulate live transcript append
      setTimeout(() => {
        setTranscript((t) => [...t, "DOCTOR: Let's check your peak flow."]);
      }, 1200);
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
  const hasCritical = safetyAlerts.some((a) => (a.level as string) === "CRITICAL");

  const finalize = () => {
    logAudit({
      actor: "Dr. Mehta",
      action: "EHR_FINALIZED",
      entity: `consultation:${id}`,
      after: { status, followUp, analysis, report },
    });
    downloadReportAsPDF({
      title: `Consultation Report · ${id}`,
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
    toast.success("EHR finalized — PDF generated");
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
            <Button
              size="sm"
              variant={recording ? "destructive" : "default"}
              onClick={toggleRecording}
            >
              {recording ? <><MicOff className="h-3.5 w-3.5 mr-1.5" />Stop transcription</> : <><Mic className="h-3.5 w-3.5 mr-1.5" />Start voice transcription</>}
            </Button>
          </div>
        </header>

        {/* Patient Details Banner (always visible, not a sidebar) */}
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
                <p><b>Severity:</b> {pre.severity} / 5</p>
                <p><b>Patient reports:</b> {pre.patientReports}</p>
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
              {recording ? "● Recording" : "Paused"}
            </span>
          </CardHeader>
          <CardContent className="text-sm space-y-2 max-h-72 overflow-auto font-mono text-xs">
            {transcript.map((line, i) => {
              const isDoc = line.startsWith("DOCTOR:");
              return (
                <div key={i}>
                  <span className={isDoc ? "text-accent" : "text-muted-foreground"}>{line.split(":")[0]}:</span>
                  {line.slice(line.indexOf(":") + 1)}
                </div>
              );
            })}
            <div className="text-muted-foreground italic">
              [Consultation Agent · en · {recording ? "live · confidence 0.94" : "idle"}]
            </div>
          </CardContent>
        </Card>

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
          {safetyAlerts.map((a, i) => (
            <div key={i} className="text-xs flex gap-2 items-start">
              <AlertTriangle className={`h-3.5 w-3.5 mt-0.5 ${a.level === "HIGH" ? "text-warning" : "text-muted-foreground"}`} />
              <div><b>{a.level}:</b> {a.msg}</div>
            </div>
          ))}
        </Card>

        <Button className="w-full" size="lg" disabled={!allApproved || hasCritical} onClick={finalize}>
          Finalize EHR & download PDF
        </Button>
        {!allApproved && <p className="text-[10px] text-muted-foreground text-center">All AI fields must be reviewed before finalization.</p>}
      </aside>
    </div>
  );
}
