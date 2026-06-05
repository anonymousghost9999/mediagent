import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { historyList } from "@/lib/mediagent/history-details";
import { treatmentStatusLabel } from "@/lib/mediagent/store";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/patient/treatments/history")({ component: Page });

function Page() {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Treatment history</div>
        <h1 className="text-2xl font-semibold">Past consultations</h1>
        <p className="text-sm text-muted-foreground">Click any row to view the full consultation, reports, and prescriptions.</p>
      </header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Date</th>
              <th className="text-left p-3">Doctor</th>
              <th className="text-left p-3">Diagnosis</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3"></th>
            </tr>
          </thead>
          <tbody>
            {historyList.map((h) => (
              <tr key={h.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-mono">{h.date}</td>
                <td className="p-3">{h.doctor}</td>
                <td className="p-3">{h.diagnosis} <span className="text-muted-foreground font-mono text-xs">({h.icd10})</span></td>
                <td className="p-3 text-muted-foreground">{treatmentStatusLabel[h.status]}</td>
                <td className="p-3 text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/patient/treatments/history/$id" params={{ id: h.id }}>
                      Details <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
