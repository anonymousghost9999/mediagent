import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/mediagent/badges";

export const Route = createFileRoute("/doctor/reviews")({ component: Page });

const reviews = [
  { id: "R-9981", patient: "Aarav Reddy", type: "Consultation Report", status: "PENDING_REVIEW" },
  { id: "R-9978", patient: "Meera Sharma", type: "Discharge Summary", status: "PENDING_REVIEW" },
  { id: "R-9972", patient: "Rohan Das", type: "Treatment Progress", status: "PENDING_REVIEW" },
];

function Page() {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Doctor · Pending reviews</div>
        <h1 className="text-2xl font-semibold">Drafts awaiting your approval</h1>
      </header>
      <div className="grid gap-2">
        {reviews.map((r) => (
          <Card key={r.id} className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium">{r.type} · <span className="text-muted-foreground">{r.patient}</span></div>
              <div className="text-xs font-mono text-muted-foreground">{r.id}</div>
            </div>
            <StatusPill status={r.status} />
          </Card>
        ))}
      </div>
    </div>
  );
}
