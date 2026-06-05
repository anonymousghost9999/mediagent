import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/doctor/appointments")({ component: Page });

const appts = [
  { time: "09:00", patient: "Lakshmi N.", reason: "Follow-up" },
  { time: "10:30", patient: "Aarav Reddy", reason: "Asthma review" },
  { time: "11:15", patient: "Vikram J.", reason: "BP check" },
  { time: "14:00", patient: "Priya M.", reason: "New consult" },
];

function Page() {
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Doctor · Appointments</div>
        <h1 className="text-2xl font-semibold">Today's schedule</h1>
      </header>
      {appts.map((a, i) => (
        <Card key={i} className="p-4 flex items-center gap-4">
          <div className="font-mono text-lg w-16">{a.time}</div>
          <div className="flex-1"><div className="font-medium">{a.patient}</div><div className="text-xs text-muted-foreground">{a.reason}</div></div>
        </Card>
      ))}
    </div>
  );
}
