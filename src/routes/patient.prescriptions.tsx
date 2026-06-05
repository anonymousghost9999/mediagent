import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPatientPrescriptions } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/mediagent/badges";

export const Route = createFileRoute("/patient/prescriptions")({ component: Page });

function Page() {
  const { user } = useAuth();
  const { data: meds } = useQuery({
    queryKey: ["patient-prescriptions", user?.id],
    enabled: !!user,
    queryFn: async () => getPatientPrescriptions(user!.id),
  });
  return (
    <div className="p-6 max-w-4xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Prescriptions</div>
        <h1 className="text-2xl font-semibold">Active prescriptions</h1>
      </header>
      {(meds?.length ? meds : []).map((m: any, i: number) => (
        <Card key={i} className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">{m.prescription}</div>
            <div className="text-xs text-muted-foreground">{m.date} · {m.doctor}</div>
          </div>
          <StatusPill status={m.status === "DRAFT" ? "PENDING_REVIEW" : "APPROVED"} />
        </Card>
      ))}
    </div>
  );
}
