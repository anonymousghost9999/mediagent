import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPatientTreatments } from "@/lib/mediagent/live";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/mediagent/badges";
import { treatmentStatusLabel, type TreatmentStatus } from "@/lib/mediagent/store";
import { CalendarClock, History, CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/patient/treatments/ongoing")({ component: Page });

function generateRecordName(diagnosis: string, userId: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  const label = diagnosis
    .toLowerCase()
    .replace(/^follow-up:\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 16)
    .replace(/-$/, "");
  const suffix = userId.slice(0, 4);
  return `${date}_${time}_followup_${label}_${suffix}`;
}

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: treatments } = useQuery({
    queryKey: ["patient-treatments", user?.id],
    enabled: !!user,
    queryFn: async () => getPatientTreatments(user!.id),
  });
  const rows = treatments ?? [];

  // Follow-up mutation
  const followUpMutation = useMutation({
    mutationFn: async ({ diagnosis, consultationId }: { diagnosis: string; consultationId: string }) => {
      const newId = crypto.randomUUID();
      const recordName = generateRecordName(diagnosis, user!.id);
      const { error } = await supabase.from("consultations").insert({
        id: newId,
        patient_id: user!.id,
        status: "follow_up_requested",
        severity_score: 3,
        chief_complaint: `Follow-up: ${diagnosis}`,
        record_name: recordName,
        assigned_doctor_id: null, // broadcast to all doctors
      });
      if (error) throw error;
      return newId;
    },
    onSuccess: (newId) => {
      toast.success("Follow-up request sent to all doctors!");
      qc.invalidateQueries({ queryKey: ["patient-treatments", user?.id] });
      qc.invalidateQueries({ queryKey: ["patient-history-consultations", user?.id] });
      navigate({ to: "/patient/consultation/new" });
    },
    onError: (err: any) => {
      toast.error("Could not send follow-up", { description: err.message });
    },
  });

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Ongoing treatments</div>
        <h1 className="text-2xl font-semibold">Active care plans</h1>
      </header>
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm border-dashed">
          No active treatments. Complete a consultation first.
        </Card>
      ) : rows.map((t, i) => {
        const isFollowingUp = followUpMutation.isPending &&
          followUpMutation.variables?.diagnosis === t.diagnosis;
        return (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>{t.diagnosis}</CardTitle>
                <div className="flex items-center gap-2">
                  <StatusPill status={t.status as any} />
                  <span className="chip bg-accent-soft border border-accent/50">
                    {treatmentStatusLabel[t.treatmentStatus as TreatmentStatus]}
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

              {t.followUpHistory.length > 0 && (
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
              )}

              {/* Follow-up request button */}
              <div className="pt-3 border-t border-border/60 flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-muted-foreground">Need to see a doctor again? Request a follow-up consultation.</p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isFollowingUp}
                  onClick={() =>
                    followUpMutation.mutate({
                      diagnosis: t.diagnosis,
                      consultationId: (t.consultation as any)?.id ?? "",
                    })
                  }
                >
                  {isFollowingUp ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <CalendarPlus className="h-4 w-4 mr-1.5" />
                  )}
                  Request Follow-up
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
