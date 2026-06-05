import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/admin/hospital-settings")({ component: Page });
function Page() {
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <header><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · Settings</div><h1 className="text-2xl font-semibold">Hospital settings</h1></header>
      <Card className="p-4 text-sm space-y-2">
        <div><span className="text-muted-foreground">Hospital name: </span>MediAgent General Hospital</div>
        <div><span className="text-muted-foreground">Departments: </span>OPD · Internal Medicine · Pulmonology · Cardiology</div>
        <div><span className="text-muted-foreground">Operating hours: </span>08:00 – 22:00</div>
        <div><span className="text-muted-foreground">Supported languages: </span>English · Telugu · Hindi</div>
      </Card>
    </div>
  );
}
