import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPatientTreatments } from "@/lib/mediagent/live";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/mediagent/badges";
import { treatmentStatusLabel, type TreatmentStatus } from "@/lib/mediagent/store";
import { CalendarClock, History } from "lucide-react";

export const Route = createFileRoute("/patient/treatments/ongoing")({ component: Page });

function Page() {
  const { user } = useAuth();
  const { data: treatments } = useQuery({
    queryKey: ["patient-treatments", user?.id],
    enabled: !!user,
    queryFn: async () => getPatientTreatments(user!.id),
  });
  const rows = treatments ?? [];
  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Ongoing treatments</div>
        <h1 className="text-2xl font-semibold">Active care plans</h1>
      </header>
      {(rows.length ? rows : []).map((t, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>{t.diagnosis}</CardTitle>
              <div className="flex items-center gap-2">
                <StatusPill status={t.status as any} />
                <span className="chip bg-accent-soft border border-accent/50">
                  {treatmentStatusLabel[t.treatmentStatus]}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Assigned doctor: </span>{t.doctor}</div>
            <div><span className="text-muted-foreground">Medications: </span>{t.meds.join(" · ") || "—"}</div>
            <div><span className="text-muted-foreground">Progress: </span>{t.progress}</div>
            <div><span className="text-muted-foreground">Next appointment: </span>{t.nextAppt}</div>
            <div className="mt-2 p-3 rounded-md bg-accent-soft border border-accent/30 flex items-start gap-2">
              <CalendarClock className="h-4 w-4 mt-0.5 text-accent" />
              <div>
                <div className="text-xs uppercase tracking-wide font-semibold">Follow-up recommendation</div>
                <div className="text-sm">{t.followUp}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Previous follow-ups</h3>
                <span className="chip bg-muted text-muted-foreground">{t.followUpHistory.length}</span>
              </div>
              <ol className="relative border-l border-border ml-2 space-y-3">
                {t.followUpHistory.map((f, idx) => (
                  <li key={idx} className="ml-4 relative">
                    <span className="absolute -left-[1.4rem] mt-1.5 h-3 w-3 rounded-full bg-accent border-2 border-background" />
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="font-mono text-xs text-muted-foreground">{f.date} · {f.doctor}</div>
                      <span className="chip bg-accent-soft border border-accent/40 text-xs">
                        {treatmentStatusLabel[f.outcome as TreatmentStatus]}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{f.summary}</p>
                    {f.vitals && <p className="text-xs text-muted-foreground mt-0.5"><b>Vitals:</b> {f.vitals}</p>}
                    {f.changes && <p className="text-xs text-muted-foreground"><b>Changes:</b> {f.changes}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
