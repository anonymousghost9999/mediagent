import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/doctor/patients")({ component: Page });

const list = [
  { mrn: "MRN-2026-00428", name: "Aarav Reddy", age: 34, last: "2026-06-05" },
  { mrn: "MRN-2026-00301", name: "Meera Sharma", age: 52, last: "2026-06-04" },
  { mrn: "MRN-2026-00188", name: "Rohan Das", age: 41, last: "2026-05-30" },
];

function Page() {
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
            {list.map((p) => (
              <tr key={p.mrn} className="border-t hover:bg-muted/30">
                <td className="p-3 font-mono text-xs">{p.mrn}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">{p.age}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{p.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
