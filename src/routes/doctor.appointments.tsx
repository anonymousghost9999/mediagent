import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDoctorAppointments } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/doctor/appointments")({ component: Page });

function Page() {
  const { data: appts } = useQuery({
    queryKey: ["doctor-appointments"],
    queryFn: async () => getDoctorAppointments(),
  });

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Doctor · Appointments</div>
        <h1 className="text-2xl font-semibold">Today's schedule</h1>
      </header>
      {(appts ?? []).map((a, i) => (
        <Card key={i} className="p-4 flex items-center gap-4">
          <div className="font-mono text-lg w-16">{a.created_at?.slice(11, 16) ?? "—"}</div>
          <div className="flex-1"><div className="font-medium">{a.patient_id}</div><div className="text-xs text-muted-foreground">{a.status?.replaceAll("_", " ")}</div></div>
        </Card>
      ))}
    </div>
  );
}
