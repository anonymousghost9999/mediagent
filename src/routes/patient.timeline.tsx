import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getPatientTimeline } from "@/lib/mediagent/live";
import { timeline } from "@/lib/mediagent/data";

export const Route = createFileRoute("/patient/timeline")({ component: Page });

function Page() {
  const { user } = useAuth();
  const { data: rows } = useQuery({
    queryKey: ["patient-timeline", user?.id],
    enabled: !!user,
    queryFn: async () => getPatientTimeline(user!.id),
  });
  const events = rows ?? timeline;
  return (
    <div className="p-6 max-w-3xl">
      <header className="mb-6">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Medical timeline</div>
        <h1 className="text-2xl font-semibold">Chronological record</h1>
        <p className="text-sm text-muted-foreground">Newest first.</p>
      </header>
      <ol className="relative border-l-2 border-accent/30 pl-6 space-y-6">
        {events.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[31px] top-1.5 grid h-4 w-4 place-items-center rounded-full bg-accent text-[10px] text-accent-foreground">●</span>
            <div className="text-xs font-mono text-muted-foreground">{e.date} · {e.type}</div>
            <div className="font-medium">{e.title}</div>
            <div className="text-xs text-muted-foreground">{e.doctor}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
