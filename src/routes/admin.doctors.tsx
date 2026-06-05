import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAdminDoctors } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/admin/doctors")({ component: Page });
function Page() {
  const { data: docs } = useQuery({
    queryKey: ["admin-doctors"],
    queryFn: async () => getAdminDoctors(),
  });
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · Doctors</div><h1 className="text-2xl font-semibold">Doctor management</h1></header>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="text-left p-3">Reg #</th><th className="text-left p-3">Name</th><th className="text-left p-3">Specialty</th><th className="text-left p-3">Department</th></tr></thead>
          <tbody>{(docs ?? []).map(d => <tr key={d.id} className="border-t"><td className="p-3 font-mono text-xs">{d.license_number ?? d.id}</td><td className="p-3 font-medium">{d.full_name}</td><td className="p-3">{d.specialization ?? "—"}</td><td className="p-3 text-muted-foreground">{d.department ?? "—"}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}
