import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/users")({ component: Page });
const rows = [
  { id: "U-001", name: "Aarav Reddy", role: "patient", active: true },
  { id: "U-002", name: "Dr. R. Mehta", role: "doctor", active: true },
  { id: "U-003", name: "S. Iyer", role: "admin", active: true },
];
function Page() {
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · Users</div><h1 className="text-2xl font-semibold">User management</h1></header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">ID</th><th className="text-left p-3">Name</th><th className="text-left p-3">Role</th><th className="text-left p-3">Status</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id} className="border-t"><td className="p-3 font-mono text-xs">{r.id}</td><td className="p-3">{r.name}</td><td className="p-3 font-mono text-xs">{r.role}</td><td className="p-3 text-success">{r.active ? "active" : "inactive"}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}
