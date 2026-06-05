import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { doctorQueue, safetyAlerts } from "@/lib/mediagent/data";
import { SeverityChip } from "@/components/mediagent/badges";
import {
  ArrowRight, AlertTriangle, Clock, Sparkles, ShieldAlert,
  CheckCircle2, ScrollText, Activity, Loader2,
} from "lucide-react";

export const Route = createFileRoute("/doctor/dashboard")({ component: Page });

function Page() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["doctor-dashboard-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: queueRows } = useQuery({
    queryKey: ["doctor-dashboard-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultations")
        .select("id,status,severity_score,created_at,patient_id,assigned_doctor_id")
        .order("severity_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const patientIds = (queueRows ?? []).map((row) => row.patient_id).filter(Boolean);

  const { data: patientNames } = useQuery({
    queryKey: ["doctor-dashboard-patients", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", patientIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pendingReviews } = useQuery({
    queryKey: ["doctor-dashboard-pending-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ehr_records")
        .select("id, consultation_id, diagnosis, is_draft, created_at")
        .eq("is_draft", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameById = new Map((patientNames ?? []).map((row) => [row.id, row.full_name]));
  const sorted = (queueRows ?? doctorQueue).map((row) => {
    if ("patient" in row && "waited" in row) {
      return row as any;
    }
    return {
      id: row.id,
      patient: nameById.get(row.patient_id) ?? "Unknown patient",
      severity: Number(row.severity_score ?? 1) as 1 | 2 | 3 | 4 | 5,
      complaint: row.status ? `${row.status.replaceAll("_", " ").toLowerCase()} · consultation` : "Live consultation",
      waited: row.created_at ? `${Math.max(1, Math.round((Date.now() - new Date(row.created_at).getTime()) / 60000))}m` : "—",
    };
  }).sort((a, b) => b.severity - a.severity);
  const current = sorted[0] ?? doctorQueue[0];
  const doctorName = profile?.full_name ? `Dr. ${profile.full_name.replace(/^Dr\.\s*/i, "")}` : "Dr. Mehta";

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Greeting */}
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Doctor</div>
            <h1 className="text-3xl font-semibold tracking-tight">Good morning, {doctorName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {sorted.length} patients in queue · AI has pre-screened each one.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            AI prioritized by severity & vitals
          </div>
        </header>

        {/* Stats strip */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <StatTile icon={Activity} label="In queue" value={sorted.length} />
          <StatTile icon={Clock} label="Avg wait" value="14m" />
          <StatTile icon={ScrollText} label="Pending reviews" value={pendingReviews?.length ?? 0} />
          <StatTile icon={CheckCircle2} label="Completed today" value={11} tone="success" />
        </div>

        {/* Main 3-col layout */}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr_300px]">
          {/* Today's queue */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Today's queue</h2>
              <Link to="/doctor/queue" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
            </div>
            <div className="space-y-2">
              {queueRows === undefined ? (
                <div className="soft-card p-6 flex flex-col items-center justify-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-accent mb-2" />
                  <span className="text-xs">Loading queue...</span>
                </div>
              ) : sorted.length === 0 ? (
                <div className="soft-card p-6 text-center text-xs text-muted-foreground">
                  No active patients in queue.
                </div>
              ) : (
                sorted.map((q) => (
                  <Link
                    key={q.id}
                    to="/doctor/consultations/$id"
                    params={{ id: q.id }}
                    className={`soft-card block p-4 hover:border-accent/40 hover:shadow-md transition ${q.id === current.id ? "border-accent/60 ring-1 ring-accent/30" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{q.patient}</div>
                      <SeverityChip level={q.severity} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{q.complaint}</div>
                    <div className="flex items-center justify-between mt-3 text-[11px] font-mono text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {q.waited}</span>
                      <span>{q.id}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          {/* Current patient */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Current patient</h2>
            <div className="soft-card p-6 md:p-8 relative overflow-hidden">
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
              <div className="relative space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Up next</div>
                    <h3 className="text-2xl font-semibold mt-1">{current.patient}</h3>
                    <div className="text-sm text-muted-foreground mt-1">{current.complaint}</div>
                  </div>
                  <SeverityChip level={current.severity} />
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm border-y border-border/60 py-4">
                  <Mini label="Waited" value={current.waited} />
                  <Mini label="Consult" value={current.id} mono />
                  <Mini label="AI ready" value="✓" tone="success" />
                </div>

                <div className="soft-card bg-accent-soft/40 border-accent/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-accent uppercase tracking-wider">
                    <Sparkles className="h-3.5 w-3.5" /> AI pre-consultation summary
                  </div>
                  <p className="text-sm mt-2 leading-relaxed">
                    Suggests ESI Level {6 - current.severity} clinical response.
                    Review history and active symptoms when initiating workspace.
                  </p>
                </div>

                {sorted.length > 0 && (
                  <Link
                    to="/doctor/consultations/$id"
                    params={{ id: current.id }}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-3 text-sm font-medium hover:opacity-90 transition"
                  >
                    Open consultation workspace <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* AI Alerts */}
          <aside className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" /> AI alerts
            </h2>
            <div className="space-y-2">
              {safetyAlerts.map((a, i) => (
                <div key={i} className={`soft-card p-3 ${a.level === "HIGH" ? "border-destructive/30 bg-destructive/5" : ""}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 ${a.level === "HIGH" ? "text-destructive" : "text-warning"}`} />
                    <div className="text-xs">
                      <div className="font-medium uppercase tracking-wider mb-0.5">{a.level} risk</div>
                      <div className="text-foreground/80 leading-relaxed">{a.msg}</div>
                    </div>
                  </div>
                </div>
              ))}
              <Link to="/doctor/reviews" className="soft-card p-3 flex items-center justify-between hover:border-accent/40 transition">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending reviews</div>
                  <div className="font-semibold mt-0.5">7 reports</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "success";
}) {
  return (
    <div className="soft-card p-4 flex items-center gap-3">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tone === "success" ? "bg-success/15 text-success" : "bg-accent-soft text-accent"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold leading-tight">{value}</div>
      </div>
    </div>
  );
}

function Mini({ label, value, mono, tone }: { label: string; value: string; mono?: boolean; tone?: "success" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`${mono ? "font-mono text-sm" : "text-base font-semibold"} ${tone === "success" ? "text-success" : ""} mt-0.5`}>{value}</div>
    </div>
  );
}
