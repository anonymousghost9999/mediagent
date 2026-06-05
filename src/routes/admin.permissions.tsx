import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/admin/permissions")({ component: Page });
const matrix = [
  ["Own profile", "R", "—", "R/U"],
  ["Consultation (own)", "C/R", "C/R/U/A", "R"],
  ["Reports", "R (approved)", "R/U/A", "R"],
  ["Prescriptions", "R", "C/R/U/A", "R"],
  ["EHR (finalized)", "R", "R", "R"],
  ["Users", "—", "—", "C/R/U/D"],
  ["Audit logs", "—", "R (own)", "R (all)"],
];
function Page() {
  return (
    <div className="p-6 max-w-4xl space-y-4">
      <header><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · RBAC</div><h1 className="text-2xl font-semibold">Permission matrix</h1></header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Entity</th><th className="text-left p-3">Patient</th><th className="text-left p-3">Doctor</th><th className="text-left p-3">Admin</th></tr></thead>
          <tbody>{matrix.map((r,i) => <tr key={i} className="border-t"><td className="p-3 font-medium">{r[0]}</td><td className="p-3 font-mono text-xs">{r[1]}</td><td className="p-3 font-mono text-xs">{r[2]}</td><td className="p-3 font-mono text-xs">{r[3]}</td></tr>)}</tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">Legend: C=Create R=Read U=Update A=Approve D=Delete</p>
    </div>
  );
}
