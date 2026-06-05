import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { historyDetails } from "@/lib/mediagent/history-details";
import { treatmentStatusLabel } from "@/lib/mediagent/store";
import { downloadReportAsPDF } from "@/components/mediagent/im-report-form";
import { profileStore } from "@/lib/mediagent/store";
import { ArrowLeft, Download, FileText, Pill, ClipboardList, FileCheck2 } from "lucide-react";

export const Route = createFileRoute("/patient/treatments/history/$id")({
  component: Page,
  notFoundComponent: () => (
    <div className="p-6"><p>Consultation record not found.</p></div>
  ),
});

function Page() {
  const { id } = Route.useParams();
  const record = historyDetails[id];
  if (!record) throw notFound();
  const patient = profileStore.get();

  const download = () => downloadReportAsPDF({
    title: `Consultation · ${record.date}`,
    patientName: patient.fullName,
    patientMrn: patient.mrn,
    doctor: record.doctor,
    data: {
      chief_complaint: record.notes,
      diagnosis: record.diagnosis,
      icd10: record.icd10,
      prescription: record.prescription.join("; "),
      advice: record.recommendations,
    },
    extras: {
      "Treatment status": treatmentStatusLabel[record.status],
      "Follow-up": record.followUp ?? "—",
      "Procedures": record.procedures.join(", ") || "—",
    },
  });

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/patient/treatments/history"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to history</Link>
      </Button>

      <header className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Consultation · {record.id}</div>
          <h1 className="text-2xl font-semibold">{record.diagnosis}</h1>
          <p className="text-sm text-muted-foreground">{record.date} · {record.doctor} · <span className="font-mono">{record.icd10}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip bg-accent-soft border border-accent/50">{treatmentStatusLabel[record.status]}</span>
          <Button size="sm" onClick={download}><Download className="h-3.5 w-3.5 mr-1.5" />Download PDF</Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Pill className="h-4 w-4" />Prescription</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {record.prescription.map((p, i) => <div key={i}>• {p}</div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Procedures</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {record.procedures.length ? record.procedures.map((p, i) => <div key={i}>• {p}</div>) : <div className="text-muted-foreground">None</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="h-4 w-4" />Reports</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {record.reports.length ? record.reports.map((r, i) => (
              <div key={i} className="flex justify-between"><span>{r.name}</span><span className="text-muted-foreground text-xs">{r.type}</span></div>
            )) : <div className="text-muted-foreground">No reports</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Documents</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            {record.documents.map((d, i) => (
              <div key={i} className="flex justify-between"><span>{d.name}</span><span className="text-muted-foreground text-xs">{d.size}</span></div>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Recommendations & follow-up</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>{record.recommendations}</p>
            {record.followUp && <p className="text-muted-foreground">Next follow-up: <b className="text-foreground">{record.followUp}</b></p>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Clinical notes</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{record.notes}</CardContent>
        </Card>
      </div>
    </div>
  );
}
