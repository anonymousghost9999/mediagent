import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDoctorQueue } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";
import { SeverityChip } from "@/components/mediagent/badges";

export const Route = createFileRoute("/doctor/queue")({ component: Page });

function Page() {
  const { data: doctorQueue } = useQuery({
    queryKey: ["doctor-queue"],
    queryFn: async () => getDoctorQueue(),
  });

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Doctor · Triage</div>
        <h1 className="text-2xl font-semibold">Severity queue</h1>
        <p className="text-sm text-muted-foreground">Sorted by severity (desc), then wait time.</p>
      </header>
      <div className="grid gap-2">
        {(doctorQueue ?? []).map((q) => (
          <Link key={q.id} to="/doctor/consultations/$id" params={{ id: q.id }}>
            <Card className="p-4 flex items-center gap-4 hover:border-accent transition-colors">
              <SeverityChip level={q.severity as 1 | 2 | 3 | 4 | 5} />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{q.patient}</div>
                <div className="text-xs text-muted-foreground truncate">{q.complaint}</div>
              </div>
              <div className="text-xs font-mono text-muted-foreground">{q.waited}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
