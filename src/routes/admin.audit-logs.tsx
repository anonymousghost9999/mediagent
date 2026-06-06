import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/audit-logs")({ component: Page });

function Page() {
  const { data: entries } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => getAuditLogs(),
  });
  return (
    <div className="p-6 max-w-6xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · Audit</div>
        <h1 className="text-2xl font-semibold">Audit logs (immutable)</h1>
        <p className="text-sm text-muted-foreground">{entries?.length ?? 0} events · append-only, written on every clinical and profile change.</p>
      </header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Id</th>
              <th className="text-left p-3">Time</th>
              <th className="text-left p-3">Actor</th>
              <th className="text-left p-3">Action</th>
              <th className="text-left p-3">Entity</th>
              <th className="text-left p-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {(entries ?? []).map((a: any) => (
              <tr key={a.id} className="border-t align-top">
                <td className="p-3 font-mono text-xs text-muted-foreground">{a.id}</td>
                <td className="p-3 font-mono text-xs">{a.created_at?.slice(11, 19)}</td>
                <td className="p-3">{a.table_name}</td>
                <td className="p-3 font-mono text-xs">{a.action_type}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{a.record_id}</td>
                <td className="p-3 text-xs text-muted-foreground">{a.previous_state || a.new_state ? "value changed" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
