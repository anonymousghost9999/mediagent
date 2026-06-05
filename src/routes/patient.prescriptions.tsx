import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { patient } from "@/lib/mediagent/data";
import { StatusPill } from "@/components/mediagent/badges";

export const Route = createFileRoute("/patient/prescriptions")({ component: Page });

function Page() {
  return (
    <div className="p-6 max-w-4xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Prescriptions</div>
        <h1 className="text-2xl font-semibold">Active prescriptions</h1>
      </header>
      {patient.currentMeds.map((m, i) => (
        <Card key={i} className="p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">{m}</div>
            <div className="text-xs text-muted-foreground">Prescribed by Dr. R. Mehta · 2026-04-02</div>
          </div>
          <StatusPill status="ACTIVE" />
        </Card>
      ))}
    </div>
  );
}
