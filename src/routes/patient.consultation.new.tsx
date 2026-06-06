import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/consultation/new")({ component: Page });

const langs = [
  { code: "en", label: "English" },
  { code: "te", label: "తెలుగు · Telugu" },
  { code: "hi", label: "हिन्दी · Hindi" },
];

function Page() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [lang, setLang] = useState("en");
  const [mode, setMode] = useState<"chat" | "voice">("chat");
  const startConsultation = useMutation({
    mutationFn: async () => {
      if (!user) {
        return { id: `local-${Date.now()}` };
      }
      // Generate a human-readable record name: YYYYMMDD_HHMM_username
      const now = new Date();
      const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
      const timePart = now.toTimeString().slice(0, 5).replace(":", "");
      const namePart = (user.full_name || user.email.split("@")[0])
        .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const record_name = `${datePart}_${timePart}_${namePart}`;

      const { data, error } = await supabase
        .from("consultations")
        .insert({ id: crypto.randomUUID(), patient_id: user.id, status: "drafting", severity_score: 3 })
        .select("id")
        .single();

      // Try to set record_name (column may not exist in all deployments)
      if (data?.id) {
        supabase.from("consultations").update({ record_name }).eq("id", data.id).then(() => {});
      }
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => nav({ to: "/patient/consultation/$id", params: { id: row.id }, search: { lang, mode } }),
    onError: (err) => {
      // Supabase unavailable or RLS block — generate a local ID and proceed anyway
      console.warn("Supabase insert failed, using local fallback:", err);
      const localId = `local-${Date.now()}`;
      nav({ to: "/patient/consultation/$id", params: { id: localId }, search: { lang, mode } });
    },
  });

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · New consultation</div>
        <h1 className="text-2xl font-semibold">Tell our AI assistant what's going on</h1>
        <p className="text-sm text-muted-foreground">A doctor reviews everything the AI captures. Nothing becomes part of your record until they approve.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Choose language</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {langs.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)}
              className={cn("px-4 py-2 rounded-md border text-sm transition",
                lang === l.code ? "border-accent bg-accent-soft" : "hover:border-accent/50")}>
              {l.label}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Choose interaction mode</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {([
            { id: "chat", icon: MessageSquare, title: "AI Chat", desc: "Type your symptoms." },
            { id: "voice", icon: Mic, title: "AI Voice Call", desc: "Speak naturally — we'll transcribe." },
          ] as const).map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={cn("rounded-md border p-4 text-left transition",
                mode === m.id ? "border-accent bg-accent-soft" : "hover:border-accent/50")}>
              <m.icon className="h-5 w-5 mb-2 text-accent" />
              <div className="font-medium">{m.title}</div>
              <div className="text-xs text-muted-foreground">{m.desc}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={() => startConsultation.mutate()} disabled={startConsultation.isPending}>
        Start with Patient Agent
      </Button>
    </div>
  );
}
