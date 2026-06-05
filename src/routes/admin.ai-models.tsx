import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
export const Route = createFileRoute("/admin/ai-models")({ component: Page });
const models = [
  { agent: "Patient Agent", model: "stt-v3 + nlu-v2", version: "1.4.0", active: true },
  { agent: "Consultation Agent", model: "med-llm-v2", version: "2.1.0", active: true },
  { agent: "EHR Agent", model: "ehr-summarizer-v1", version: "1.0.3", active: true },
];
function Page() {
  return (
    <div className="p-6 max-w-4xl space-y-4">
      <header><div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · AI</div><h1 className="text-2xl font-semibold">AI model configuration</h1></header>
      {models.map(m => (
        <Card key={m.agent} className="p-4 flex items-center gap-4">
          <div className="flex-1"><div className="font-medium">{m.agent}</div><div className="text-xs font-mono text-muted-foreground">{m.model} · v{m.version}</div></div>
          <span className="chip bg-success/20 text-foreground border border-success/40">active</span>
        </Card>
      ))}
    </div>
  );
}
