import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { auditSample } from "@/lib/mediagent/data";

export const Route = createFileRoute("/admin/dashboard")({ component: Page });

function Page() {
  return (
    <div className="p-6 max-w-6xl space-y-6">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
      </header>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { l: "Active users", v: 384 },
          { l: "Doctors", v: 27 },
          { l: "Consultations today", v: 142 },
          { l: "Reports finalized", v: 89 },
        ].map((s) => (
          <Card key={s.l}><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground tracking-wider">{s.l}</div><div className="text-2xl font-semibold mt-1">{s.v}</div></CardContent></Card>
        ))}
      </div>
      <Card>
        <div className="p-4 border-b font-semibold">Recent audit events</div>
        <table className="w-full text-sm">
          <tbody>
            {auditSample.map((a, i) => (
              <tr key={i} className="border-t">
                <td className="p-3 font-mono text-xs text-muted-foreground">{a.at}</td>
                <td className="p-3">{a.actor}</td>
                <td className="p-3 font-mono text-xs">{a.action}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{a.entity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
