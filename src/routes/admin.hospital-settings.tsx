import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getHospitals } from "@/lib/mediagent/live";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/admin/hospital-settings")({ component: Page });
function Page() {
  const { data: hospitals } = useQuery({
    queryKey: ["admin-hospitals"],
    queryFn: async () => getHospitals(),
  });
  const hospital = hospitals?.[0];
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <header><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · Settings</div><h1 className="text-2xl font-semibold">Hospital settings</h1></header>
      <Card className="p-4 text-sm space-y-2">
        <div><span className="text-muted-foreground">Hospital name: </span>{hospital?.hospital_name ?? "—"}</div>
        <div><span className="text-muted-foreground">Hospital code: </span>{hospital?.hospital_code ?? "—"}</div>
        <div><span className="text-muted-foreground">Address: </span>{hospital?.address ?? "—"}</div>
        <div><span className="text-muted-foreground">Departments: </span>From hospital records</div>
      </Card>
    </div>
  );
}
