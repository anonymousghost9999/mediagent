import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getConsultationById } from "@/lib/mediagent/live";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Send, Mic, MicOff, Sparkles, Check, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { postIntake, postIntakeAudio, getPatientTimeline } from "@/lib/api/client";
import { toast } from "sonner";

export const Route = createFileRoute("/patient/consultation/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    lang: (s.lang as string) ?? "en",
    mode: (s.mode as "chat" | "voice") ?? "chat",
  }),
  component: Page,
});

type Msg = { from: "agent" | "patient"; text: string };

const getInitialGreeting = (lang: string) => {
  if (lang === "te") {
    return "నమస్తే, నేను మీడియాజెంట్. మీకు ఈరోజు ఎలాంటి లక్షణాలు ఉన్నాయో దయచేసి వివరించండి.";
  }
  if (lang === "hi") {
    return "नमस्ते, मैं मीडियाजेंट हूँ। कृपया बताएं कि आज आपको क्या लक्षण महसूस हो रहे हैं।";
  }
  return "Hi, I'm MediAgent. Please describe what symptoms you are experiencing today.";
};

type Step = { id: string; label: string; state: "pending" | "running" | "done" };

const initialSteps: Step[] = [
  { id: "s1", label: "Symptoms captured", state: "pending" },
  { id: "s2", label: "Medical history recorded", state: "pending" },
  { id: "s3", label: "Severity assessment", state: "pending" },
  { id: "s4", label: "Pre-consultation report", state: "pending" },
];

function Page() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["patient-consultation", id],
    queryFn: async () => getConsultationById(id),
  });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [steps, setSteps] = useState<Step[]>(initialSteps);
  const [typing, setTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [resolvedId, setResolvedId] = useState(id);
  const [loading, setLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Generate or resolve patient ID on load
    if (id === "C-NEW") {
      const newId = `patient-${Math.floor(1000 + Math.random() * 9000)}`;
      setResolvedId(newId);
    } else {
      setResolvedId(id);
    }
  }, [id]);

  useEffect(() => {
    if (!resolvedId || resolvedId === "C-NEW") return;

    const loadHistory = async () => {
      try {
        const timelineEvents = await getPatientTimeline(resolvedId);
        const chatMsgs = timelineEvents
          .filter((e: any) => e.event_type === "intake_chat_message")
          .map((e: any) => ({
            from: e.details.role === "patient" ? "patient" : "agent",
            text: e.details.text
          }));

        if (chatMsgs.length > 0) {
          setMsgs(chatMsgs);

          // Restore steps state if a report exists in localStorage
          const savedReport = localStorage.getItem(`mediagent_report_${resolvedId}`);
          if (savedReport) {
            const res = JSON.parse(savedReport);
            updateStepsFromReport(res);
          }
        } else {
          setMsgs([
            { from: "agent", text: getInitialGreeting(search.lang) }
          ]);
        }
      } catch (err) {
        console.error("Failed to load patient timeline:", err);
        setMsgs([
          { from: "agent", text: getInitialGreeting(search.lang) }
        ]);
      }
    };

    loadHistory();
  }, [resolvedId, search.lang]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const updateStepsFromReport = (res: any) => {
    setSteps((prev) => {
      return prev.map((s) => {
        if (s.id === "s1") {
          const hasSymptoms = res.primary_issue && res.primary_issue.toLowerCase() !== "unknown" && res.primary_issue.toLowerCase() !== "not sure";
          return { ...s, state: hasSymptoms ? "done" : "running" };
        }
        if (s.id === "s2") {
          const hasHistory = res.allergies && res.chronic_diseases;
          return { ...s, state: hasHistory ? "done" : "running" };
        }
        if (s.id === "s3") {
          const hasSeverity = typeof res.severity_score === "number" && res.severity_score > 0;
          return { ...s, state: hasSeverity ? "done" : "running" };
        }
        if (s.id === "s4") {
          return { ...s, state: res.is_intake_complete ? "done" : "pending" };
        }
        return s;
      });
    });
  };

  const send = async () => {
    if (!draft.trim() || loading) return;
    const userText = draft;
    setDraft("");
    setMsgs((m) => [...m, { from: "patient", text: userText }]);
    setTyping(true);
    setLoading(true);

    // Set first steps to running
    setSteps((prev) => prev.map((s, i) => i === 0 ? { ...s, state: "running" } : s));

    try {
      const res = await postIntake({
        patient_id: resolvedId,
        name: user?.full_name || user?.email || "Patient",
        age: 30, // age not stored in profile currently
        gender: user?.gender || "Other",
        allergies: user?.allergies || [],
        medical_history: [...(user?.chronic_conditions || []), ...(user?.current_meds || [])].join(", "),
        symptom_text: userText,
        language: search.lang === "te" ? "telugu" : search.lang === "hi" ? "hindi" : "english",
        mode: search.mode,
      });

      // Dynamically update steps based on report completeness
      updateStepsFromReport(res);

      // Save report details to localStorage
      localStorage.setItem(`mediagent_report_${resolvedId}`, JSON.stringify(res));
      localStorage.setItem(`mediagent_patient_id`, resolvedId);

      // Persist intake output to Supabase so doctor can read it cross-browser
      const now = new Date();
      const dp = now.toISOString().slice(0, 10).replace(/-/g, "");
      const tp = now.toTimeString().slice(0, 5).replace(":", "");
      const np = (user?.full_name || user?.email?.split("@")[0] || "patient")
        .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const fallbackName = `${dp}_${tp}_${np}`;
      supabase.from("consultations").update({
        chief_complaint: res.primary_issue || res.english_symptoms || userText.slice(0, 500),
        severity_score: typeof res.severity_score === "number" ? res.severity_score : 3,
        intake_summary: JSON.stringify(res),
        intake_original_transcript: res.original_transcript || userText,
        intake_english_translation: res.english_symptoms || res.primary_issue || userText,
        symptoms: JSON.stringify(res.symptoms ?? []),
        status: res.is_intake_complete ? "waiting" : "drafting",
        record_name: fallbackName,
      }).eq("id", resolvedId).then(({ error }) => {
        if (error) console.warn("[intake] Supabase update failed (non-blocking):", error.message);
      });

      setMsgs((m) => [...m, { from: "agent", text: res.agent_response_translated }]);

      // Audio Speech playback (only in voice mode)
      if (search.mode === "voice" && res.agent_response_audio) {
        try {
          const audioUrl = `data:audio/wav;base64,${res.agent_response_audio}`;
          const audio = new Audio(audioUrl);
          await audio.play();
        } catch (audioErr) {
          console.error("Audio playback failed:", audioErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to connect to backend.");
      // Rollback the intake steps since it failed
      setSteps((prev) => prev.map((s, i) => i === 0 ? { ...s, state: "pending" } : s));
      // Put the text back in the input box so the user doesn't lose it
      setDraft(userText);
      // Remove the failed user message bubble
      setMsgs((m) => m.slice(0, -1));
    } finally {
      setTyping(false);
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        await submitAudio(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
      toast.success("Recording started... Speak now.");
    } catch (err) {
      console.error("Mic access error:", err);
      toast.error("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      toast.info("Recording stopped. Processing...");
    }
  };

  const submitAudio = async (audioBlob: Blob) => {
    setLoading(true);
    setTyping(true);
    setMsgs((m) => [...m, { from: "patient", text: "[Sent audio message]" }]);
    setSteps((prev) => prev.map((s, i) => i === 0 ? { ...s, state: "running" } : s));

    try {
      const formData = new FormData();
      formData.append("name", user?.full_name || user?.email || "Patient");
      formData.append("age", "30");
      formData.append("gender", user?.gender || "Other");
      formData.append("allergies", JSON.stringify(user?.allergies || []));
      formData.append("medical_history", [...(user?.chronic_conditions || []), ...(user?.current_meds || [])].join(", "));
      formData.append("language", search.lang === "te" ? "telugu" : search.lang === "hi" ? "hindi" : "english");
      formData.append("patient_id", resolvedId);
      formData.append("audio_file", audioBlob, "intake.wav");

      const res = await postIntakeAudio(formData);

      // Dynamically update steps based on report completeness
      updateStepsFromReport(res);

      // Save report details to localStorage
      localStorage.setItem(`mediagent_report_${resolvedId}`, JSON.stringify(res));
      localStorage.setItem(`mediagent_patient_id`, resolvedId);

      // Persist intake output to Supabase so doctor can read it cross-browser
      const now2 = new Date();
      const dp2 = now2.toISOString().slice(0, 10).replace(/-/g, "");
      const tp2 = now2.toTimeString().slice(0, 5).replace(":", "");
      const np2 = (user?.full_name || user?.email?.split("@")[0] || "patient")
        .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      supabase.from("consultations").update({
        chief_complaint: res.primary_issue || res.english_symptoms || "Audio intake",
        severity_score: typeof res.severity_score === "number" ? res.severity_score : 3,
        intake_summary: JSON.stringify(res),
        intake_original_transcript: res.original_transcript || "",
        intake_english_translation: res.english_symptoms || res.primary_issue || "",
        symptoms: JSON.stringify(res.symptoms ?? []),
        status: res.is_intake_complete ? "waiting" : "drafting",
        record_name: `${dp2}_${tp2}_${np2}`,
      }).eq("id", resolvedId).then(({ error }) => {
        if (error) console.warn("[intake-audio] Supabase update failed (non-blocking):", error.message);
      });

      // Update patient's message bubble with transcript
      setMsgs((m) => {
        const updated = [...m];
        if (updated.length > 0 && updated[updated.length - 1].text === "[Sent audio message]") {
          updated[updated.length - 1] = { from: "patient", text: res.original_transcript || "[Audio Symptom]" };
        }
        return [...updated, { from: "agent", text: res.agent_response_translated }];
      });

      if (search.mode === "voice" && res.agent_response_audio) {
        try {
          const audioUrl = `data:audio/wav;base64,${res.agent_response_audio}`;
          const audio = new Audio(audioUrl);
          await audio.play();
        } catch (audioErr) {
          console.error("Audio playback failed:", audioErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to evaluate audio intake.");
      // Rollback the intake steps since it failed
      setSteps((prev) => prev.map((s, i) => i === 0 ? { ...s, state: "pending" } : s));
      // Remove the failed user audio message bubble
      setMsgs((m) => m.slice(0, -1));
    } finally {
      setTyping(false);
      setLoading(false);
    }
  };

  const allDone = steps.every((s) => s.state === "done");

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Chat */}
        <div className="flex flex-col min-h-[calc(100vh-9rem)]">
          <header className="pb-4">
            <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Consultation · {resolvedId}</div>
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
                disabled={loading || recording || allDone}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={1}
                placeholder={allDone ? "Intake complete. Please click on the report to proceed." : recording ? "Recording audio..." : "Describe what's going on…"}
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              {search.mode === "voice" && (
                <Button 
                  size="icon" 
                  variant={recording ? "destructive" : "ghost"} 
                  className="rounded-full"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={loading || allDone}
                >
                  {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Button size="icon" onClick={send} className="rounded-full" disabled={!draft.trim() || loading || recording || allDone}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
              params={{ id: resolvedId }}
              search={{ lang: search.lang, mode: search.mode }}
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
              setTimeout(() => nav({ to: "/patient/consultation/$id/report", params: { id: resolvedId }, search: { lang: search.lang, mode: search.mode } }), 200);
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
        <div className="text-[15px] leading-relaxed max-w-[80%] text-foreground whitespace-pre-line">{text}</div>
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

