import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDoctorReviews } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/mediagent/badges";

export const Route = createFileRoute("/doctor/reviews")({ component: Page });

function Page() {
  const { data: reviews } = useQuery({
    queryKey: ["doctor-reviews"],
    queryFn: async () => getDoctorReviews(),
  });

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Doctor · Pending reviews</div>
        <h1 className="text-2xl font-semibold">Drafts awaiting your approval</h1>
      </header>
      <div className="grid gap-2">
        {(reviews ?? []).map((r) => (
          <Card key={r.id} className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium">{r.type} · <span className="text-muted-foreground">{r.patient}</span></div>
              <div className="text-xs font-mono text-muted-foreground">{r.id}</div>
            </div>
            <StatusPill status={r.status as any} />
          </Card>
        ))}
      </div>
    </div>
  );
}
