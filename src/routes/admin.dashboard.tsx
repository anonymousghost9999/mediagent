import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs } from "@/lib/mediagent/live";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/admin/dashboard")({ component: Page });

function Page() {
  const { data: stats } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const [users, doctors, consultations, finalized, audit] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "doctor"),
        supabase.from("consultations").select("id", { count: "exact", head: true }),
        supabase.from("ehr_records").select("id", { count: "exact", head: true }).eq("is_draft", false),
        getAuditLogs(),
      ]);
      return { users, doctors, consultations, finalized, audit };
    },
  });
  return (
    <div className="p-6 max-w-6xl space-y-6">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
      </header>
      <div className="grid gap-4 md:grid-cols-4">
          {[
          { l: "Active users", v: stats?.users.count ?? 0 },
          { l: "Doctors", v: stats?.doctors.count ?? 0 },
          { l: "Consultations today", v: stats?.consultations.count ?? 0 },
          { l: "Reports finalized", v: stats?.finalized.count ?? 0 },
        ].map((s) => (
          <Card key={s.l}><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground tracking-wider">{s.l}</div><div className="text-2xl font-semibold mt-1">{s.v}</div></CardContent></Card>
        ))}
      </div>
      <Card>
        <div className="p-4 border-b font-semibold">Recent audit events</div>
        <table className="w-full text-sm">
          <tbody>
            {(stats?.audit ?? []).slice(0, 4).map((a: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="p-3 font-mono text-xs text-muted-foreground">{a.created_at?.slice(11, 19)}</td>
                <td className="p-3">{a.table_name}</td>
                <td className="p-3 font-mono text-xs">{a.action_type}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{a.record_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
