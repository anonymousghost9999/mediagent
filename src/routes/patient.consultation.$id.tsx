import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Mic, Sparkles, Check, Loader2, ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/patient/consultation/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    lang: (s.lang as string) ?? "en",
    mode: (s.mode as "chat" | "voice") ?? "chat",
  }),
  component: Page,
});

type Msg = { from: "agent" | "patient"; text: string };

const script: Msg[] = [
  { from: "agent", text: "Hi, I'm MediAgent. What's bothering you today?" },
];

const followUps = [
  "How severe is the wheezing on a scale of 1 to 5?",
  "Any fever, chest pain, or shortness of breath at rest?",
  "Are you taking your inhaler regularly?",
  "Thanks — I have enough to prepare a report for your doctor.",
];

type Step = { id: string; label: string; state: "pending" | "running" | "done" };

const initialSteps: Step[] = [
  { id: "s1", label: "Symptoms captured", state: "pending" },
  { id: "s2", label: "Medical history recorded", state: "pending" },
  { id: "s3", label: "Severity assessment", state: "pending" },
  { id: "s4", label: "Pre-consultation report", state: "pending" },
];

function Page() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>(script);
  const [draft, setDraft] = useState("");
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [typing, setTyping] = useState(false);
  const turnRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const advanceStep = (idx: number) => {
    setSteps((prev) => prev.map((s, i) => {
      if (i < idx) return { ...s, state: "done" };
      if (i === idx) return { ...s, state: "running" };
      return s;
    }));
    setTimeout(() => {
      setSteps((prev) => prev.map((s, i) => i === idx ? { ...s, state: "done" } : s));
    }, 800);
  };

  const send = () => {
    if (!draft.trim()) return;
    const userText = draft;
    setDraft("");
    setMsgs((m) => [...m, { from: "patient", text: userText }]);
    advanceStep(Math.min(turnRef.current, steps.length - 1));
    setTyping(true);
    setTimeout(() => {
      const next = followUps[turnRef.current] ?? "Got it. Anything else?";
      setMsgs((m) => [...m, { from: "agent", text: next }]);
      setTyping(false);
      turnRef.current += 1;
    }, 900);
  };

  const allDone = steps.every((s) => s.state === "done");

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Chat */}
        <div className="flex flex-col min-h-[calc(100vh-9rem)]">
          <header className="pb-4">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Consultation · {id}</div>
            <h1 className="text-2xl font-semibold tracking-tight">MediAgent intake</h1>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
            {msgs.map((m, i) => (
              <Bubble key={i} from={m.from} text={m.text} />
            ))}
            {typing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 pulse-dot" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 pulse-dot" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 pulse-dot" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="pt-4 mt-4 border-t border-border/60">
            <div className="soft-card flex items-end gap-2 p-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={1}
                placeholder="Describe what's going on…"
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <Button size="icon" variant="ghost" className="rounded-full">
                <Mic className="h-4 w-4" />
              </Button>
              <Button size="icon" onClick={send} className="rounded-full" disabled={!draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> A doctor reviews everything before it enters your record.
            </div>
          </div>
        </div>

        {/* AI thinking panel */}
        <aside className="space-y-4">
          <div className="soft-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="relative">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="absolute -inset-1 rounded-full bg-accent/20 blur pulse-dot" />
              </div>
              <div className="text-sm font-semibold">AI is analyzing</div>
            </div>
            <ol className="space-y-3">
              {steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  {s.state === "done" ? (
                    <div className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-success/15 text-success">
                      <Check className="h-3 w-3" />
                    </div>
                  ) : s.state === "running" ? (
                    <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-accent" />
                  ) : (
                    <div className="mt-0.5 h-5 w-5 rounded-full border border-border" />
                  )}
                  <span className={s.state === "pending" ? "text-muted-foreground" : "text-foreground"}>
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {allDone && (
            <Link
              to="/patient/consultation/$id/report"
              params={{ id }}
              className="soft-card ai-glow block p-5 hover:-translate-y-0.5 transition"
            >
              <div className="text-xs uppercase tracking-wider text-accent font-medium">Ready</div>
              <div className="font-semibold mt-1">View pre-consultation report</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                Open report <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          )}

          <button
            onClick={() => {
              setSteps(initialSteps.map((s) => ({ ...s, state: "done" })));
              setTimeout(() => nav({ to: "/patient/consultation/$id/report", params: { id } }), 200);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Skip to demo report →
          </button>
        </aside>
      </div>
    </div>
  );
}

function Bubble({ from, text }: { from: "agent" | "patient"; text: string }) {
  if (from === "agent") {
    return (
      <div className="flex gap-3">
        <div className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent shrink-0">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="text-[15px] leading-relaxed max-w-[80%] text-foreground">{text}</div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-[15px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}
