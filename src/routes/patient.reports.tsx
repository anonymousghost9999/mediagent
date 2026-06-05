import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPatientReports } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { StatusPill } from "@/components/mediagent/badges";

export const Route = createFileRoute("/patient/reports")({ component: Page });

function Page() {
  const { user } = useAuth();
  const { data: reports } = useQuery({
    queryKey: ["patient-reports", user?.id],
    enabled: !!user,
    queryFn: async () => getPatientReports(user!.id),
  });
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Reports</div>
        <h1 className="text-2xl font-semibold">Approved reports</h1>
      </header>
      <div className="grid gap-3">
        {(reports ?? []).map((r) => (
          <Card key={r.id} className="p-4 flex items-center gap-4">
            <FileText className="h-5 w-5 text-accent" />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{r.type} <span className="font-mono text-xs text-muted-foreground ml-2">{r.id}</span></div>
              <div className="text-xs text-muted-foreground">{r.date}</div>
            </div>
            <StatusPill status={r.status as any} />
            <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> PDF</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
