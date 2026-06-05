import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDoctorPatients } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/doctor/patients")({ component: Page });

function Page() {
  const { data: list } = useQuery({
    queryKey: ["doctor-patients"],
    queryFn: async () => getDoctorPatients(),
  });

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Doctor · Patients</div>
        <h1 className="text-2xl font-semibold">My patients</h1>
      </header>
      <Input placeholder="Search by name or MRN…" className="max-w-sm" />
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr><th className="text-left p-3">MRN</th><th className="text-left p-3">Name</th><th className="text-left p-3">Age</th><th className="text-left p-3">Last visit</th></tr>
          </thead>
          <tbody>
            {(list ?? []).map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-mono text-xs">{p.mrn ?? p.id}</td>
                <td className="p-3 font-medium">{p.full_name}</td>
                <td className="p-3">—</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">Live Supabase</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
