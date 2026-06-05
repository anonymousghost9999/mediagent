import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAdminUsers } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/users")({ component: Page });
function Page() {
  const { data: rows } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => getAdminUsers(),
  });
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · Users</div><h1 className="text-2xl font-semibold">User management</h1></header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">ID</th><th className="text-left p-3">Name</th><th className="text-left p-3">Role</th><th className="text-left p-3">Status</th></tr></thead>
          <tbody>{(rows ?? []).map(r => <tr key={r.id} className="border-t"><td className="p-3 font-mono text-xs">{r.id}</td><td className="p-3">{r.full_name}</td><td className="p-3 font-mono text-xs">{r.role}</td><td className="p-3 text-success">active</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}
