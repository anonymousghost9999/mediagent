import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { SeverityChip } from "@/components/mediagent/badges";
import {
  ArrowRight, AlertTriangle, Clock, Sparkles, ShieldAlert,
  CheckCircle2, ScrollText, Activity, Loader2, FileText, User,
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

  // Fetch ALL consultation intake records — no limit, all patients visible to all doctors
  const { data: allRecords, isLoading } = useQuery({
    queryKey: ["doctor-dashboard-all-records"],
    refetchInterval: 30_000, // refresh every 30s
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultations")
        .select("id, status, severity_score, created_at, patient_id, assigned_doctor_id, chief_complaint, intake_summary, record_name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const patientIds = (allRecords ?? []).map((row) => row.patient_id).filter(Boolean) as string[];

  const { data: patientProfiles } = useQuery({
    queryKey: ["doctor-dashboard-patient-profiles", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
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

  const { data: ehrAlerts } = useQuery({
    queryKey: ["doctor-dashboard-safety-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ehr_records")
        .select("id, safety_alerts")
        .not("safety_alerts", "is", null);
      if (error) throw error;
      return data ?? [];
    }
  });

  const alerts = (ehrAlerts ?? [])
    .flatMap((e) => {
      try {
        if (!e.safety_alerts) return [];
        const parsed = typeof e.safety_alerts === "string" ? JSON.parse(e.safety_alerts) : e.safety_alerts;
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") return [parsed];
      } catch { }
      return [];
    })
    .map((a: any) => ({
      level: a.level || a.severity || "MEDIUM",
      msg: a.msg || a.description || "Drug safety warning."
    }));

  const profileById = new Map((patientProfiles ?? []).map((p) => [p.id, p]));

  // Enrich records with patient name and sort by severity ascending (1 = Resuscitation is highest priority)
  const records = (allRecords ?? []).map((row) => {
    const pat = profileById.get(row.patient_id as string);
    const patName = pat?.full_name ?? pat?.email?.split("@")[0] ?? "Unknown patient";
    const hasIntake = !!row.intake_summary;
    // Parse chief complaint from intake_summary if not already set
    let complaint = row.chief_complaint || "";
    if (!complaint && row.intake_summary) {
      try {
        const parsed = JSON.parse(row.intake_summary as string);
        complaint = parsed.primary_issue || parsed.english_symptoms || "";
      } catch { /* ignore */ }
    }
    return {
      id: row.id,
      patient: patName,
      patientId: row.patient_id,
      severity: (Number(row.severity_score ?? 3)) as 1 | 2 | 3 | 4 | 5,
      complaint: complaint || "Intake pending…",
      waited: row.created_at
        ? `${Math.max(1, Math.round((Date.now() - new Date(row.created_at as string).getTime()) / 60000))}m`
        : "—",
      createdAt: row.created_at as string,
      recordName: (row.record_name as string | null) || row.id.slice(0, 8),
      status: row.status as string,
      hasIntake,
    };
  }).sort((a, b) => a.severity - b.severity);

  const doctorName = profile?.full_name
    ? `Dr. ${profile.full_name.replace(/^Dr\.\s*/i, "")}`
    : "Doctor";

  const current = records[0];

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Greeting */}
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Doctor</div>
            <h1 className="text-3xl font-semibold tracking-tight">Good morning, {doctorName}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {records.length} patient records · AI has pre-screened each one.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            AI prioritized by severity &amp; vitals
          </div>
        </header>

        {/* Stats strip */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <StatTile icon={Activity} label="Total records" value={records.length} />
          <StatTile icon={FileText} label="With intake" value={records.filter((r) => r.hasIntake).length} />
          <StatTile icon={ScrollText} label="Pending reviews" value={pendingReviews?.length ?? 0} />
          <StatTile icon={CheckCircle2} label="Waiting" value={records.filter((r) => r.status === "waiting").length} tone="success" />
        </div>

        {/* Main 2-col layout */}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* All Patient Records Table */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">All Patient Intake Records</h2>
              <span className="text-xs text-muted-foreground font-mono">{records.length} records · live</span>
            </div>

            {isLoading ? (
              <div className="soft-card p-8 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-accent mb-2" />
                <span className="text-xs">Loading records…</span>
              </div>
            ) : records.length === 0 ? (
              <div className="soft-card p-8 text-center text-xs text-muted-foreground">
                No patient records yet. Records appear here after patients complete their intake.
              </div>
            ) : (
              <div className="space-y-2">
                {records.map((rec) => (
                  <Link
                    key={rec.id}
                    to="/doctor/consultations/$id"
                    params={{ id: rec.id }}
                    className="soft-card flex items-center gap-4 p-4 hover:border-accent/40 hover:shadow-md transition group"
                  >
                    {/* Status dot */}
                    <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      rec.status === "waiting" ? "bg-orange-500 animate-pulse" :
                      rec.status === "completed" ? "bg-green-500" :
                      rec.hasIntake ? "bg-accent" : "bg-muted-foreground/40"
                    }`} />

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Record name */}
                      <div className="font-mono text-xs text-accent mb-0.5 truncate">{rec.recordName}</div>
                      {/* Patient name + complaint */}
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{rec.patient}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rec.complaint}</div>
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-3 shrink-0">
                      <SeverityChip level={rec.severity} />
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                          <Clock className="h-3 w-3" />{rec.waited} ago
                        </div>
                        <div className={`text-[10px] mt-0.5 rounded px-1.5 py-0.5 font-mono ${
                          rec.status === "waiting" ? "bg-orange-100 text-orange-700" :
                          rec.status === "completed" ? "bg-green-100 text-green-700" :
                          rec.hasIntake ? "bg-accent/15 text-accent" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {rec.hasIntake ? rec.status : "awaiting intake"}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Right column */}
          <aside className="space-y-4">
            {/* Current / highest priority patient */}
            {current && (
              <div className="soft-card p-5 space-y-3 relative overflow-hidden">
                <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Highest priority</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-lg truncate">{current.patient}</div>
                    <SeverityChip level={current.severity} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{current.complaint}</div>
                  <div className="font-mono text-[10px] text-accent mt-1 truncate">{current.recordName}</div>
                  <Link
                    to="/doctor/consultations/$id"
                    params={{ id: current.id }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition"
                  >
                    Open workspace <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}

            {/* AI Alerts */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-destructive" /> AI alerts
              </h2>
              {alerts.length === 0 ? (
                <div className="soft-card p-4 text-center text-xs text-muted-foreground bg-muted/20 border-dashed border">
                  No active medication safety alerts.
                </div>
              ) : (
                alerts.map((a, i) => (
                  <div key={i} className={`soft-card p-3 ${(a.level || "").toUpperCase() === "HIGH" || (a.level || "").toUpperCase() === "CRITICAL" ? "border-destructive/30 bg-destructive/5" : ""}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`h-4 w-4 mt-0.5 ${(a.level || "").toUpperCase() === "HIGH" || (a.level || "").toUpperCase() === "CRITICAL" ? "text-destructive" : "text-warning"}`} />
                      <div className="text-xs">
                        <div className="font-medium uppercase tracking-wider mb-0.5">{a.level} risk</div>
                        <div className="text-foreground/80 leading-relaxed">{a.msg}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <Link to="/doctor/reviews" className="soft-card p-3 flex items-center justify-between hover:border-accent/40 transition">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Pending reviews</div>
                  <div className="font-semibold mt-0.5">{pendingReviews?.length ?? 0} reports</div>
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
