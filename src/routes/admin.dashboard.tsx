import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users, Stethoscope, ClipboardList, FileCheck2, Activity,
  ShieldAlert, Clock, UserRound, CheckCircle2, CircleDot, AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/admin/dashboard")({ component: Page });

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  tone?: "success" | "warn" | "danger";
}) {
  const toneClass = tone === "success" ? "bg-green-500/15 text-green-600" :
    tone === "warn" ? "bg-amber-500/15 text-amber-600" :
    tone === "danger" ? "bg-red-500/15 text-red-600" :
    "bg-accent/15 text-accent";
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold leading-tight">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "completed" ? "bg-green-500" :
    status === "waiting" ? "bg-amber-500 animate-pulse" :
    status === "follow_up_requested" ? "bg-blue-500" :
    "bg-muted-foreground/40";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function Page() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [users, doctors, patients, consultations, active, completed, finalized, ehrRecords] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "doctor"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "patient"),
        supabase.from("consultations").select("id", { count: "exact", head: true }),
        supabase.from("consultations").select("id", { count: "exact", head: true }).neq("status", "completed"),
        supabase.from("consultations").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("ehr_records").select("id", { count: "exact", head: true }).eq("is_draft", false),
        supabase.from("ehr_records").select("id", { count: "exact", head: true }).eq("is_draft", true),
      ]);
      return {
        totalUsers: users.count ?? 0,
        doctors: doctors.count ?? 0,
        patients: patients.count ?? 0,
        totalConsultations: consultations.count ?? 0,
        activeConsultations: active.count ?? 0,
        completedConsultations: completed.count ?? 0,
        finalizedEHRs: finalized.count ?? 0,
        draftEHRs: ehrRecords.count ?? 0,
      };
    },
  });

  // Recent consultations
  const { data: recentConsults } = useQuery({
    queryKey: ["admin-recent-consultations"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("consultations")
        .select("id, status, severity_score, created_at, chief_complaint, record_name, patient_id, assigned_doctor_id")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // All users
  const { data: allUsers } = useQuery({
    queryKey: ["admin-all-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, created_at, department, specialization")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  // Recent audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ["admin-audit-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const patientIds = [...new Set((recentConsults ?? []).map((c) => c.patient_id).filter(Boolean))] as string[];
  const { data: patientProfiles } = useQuery({
    queryKey: ["admin-patient-names", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", patientIds);
      return data ?? [];
    },
  });
  const patientById = new Map((patientProfiles ?? []).map((p) => [p.id, p]));

  const roleColor = (role: string) =>
    role === "doctor" ? "bg-accent/15 text-accent" :
    role === "patient" ? "bg-green-500/15 text-green-700" :
    "bg-purple-500/15 text-purple-700";

  return (
    <div className="p-6 max-w-7xl space-y-8">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Admin · System</div>
        <h1 className="text-3xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time view of all platform activity.</p>
      </header>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard icon={Users} label="Total users" value={stats?.totalUsers ?? 0} sub={`${stats?.patients ?? 0} patients · ${stats?.doctors ?? 0} doctors`} />
        <StatCard icon={ClipboardList} label="Active consultations" value={stats?.activeConsultations ?? 0} tone="warn" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats?.completedConsultations ?? 0} tone="success" />
        <StatCard icon={FileCheck2} label="Finalized EHRs" value={stats?.finalizedEHRs ?? 0} sub={`${stats?.draftEHRs ?? 0} drafts pending`} tone="success" />
      </div>

      {/* Main 2-col */}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

        {/* Recent consultations table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              Recent consultations
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Ticket</th>
                  <th className="text-left p-3">Patient</th>
                  <th className="text-left p-3">Complaint</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {(recentConsults ?? []).map((c) => {
                  const pat = patientById.get(c.patient_id ?? "");
                  const name = pat?.full_name || pat?.email?.split("@")[0] || c.patient_id?.slice(0, 8) || "—";
                  const complaint = c.chief_complaint || "Intake pending";
                  return (
                    <tr key={c.id} className="border-t hover:bg-muted/20">
                      <td className="p-3 font-mono text-xs text-accent">{c.record_name ?? c.id.slice(0, 8)}</td>
                      <td className="p-3 font-medium">{name}</td>
                      <td className="p-3 text-muted-foreground max-w-[180px] truncate">{complaint}</td>
                      <td className="p-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <StatusDot status={c.status ?? ""} />
                          {(c.status ?? "").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                        {c.created_at?.slice(0, 10)}
                      </td>
                    </tr>
                  );
                })}
                {(recentConsults ?? []).length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">No consultations yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* Audit log */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-accent" />
                Audit log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(auditLogs ?? []).length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground text-center">No audit events yet</div>
                )}
                {(auditLogs ?? []).map((a: any, i) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{a.action_type || a.table_name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{a.created_at?.slice(0, 19).replace("T", " ")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Users table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserRound className="h-4 w-4 text-accent" />
            All registered users
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Department / Spec</th>
                <th className="text-right p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(allUsers ?? []).map((u) => (
                <tr key={u.id} className="border-t hover:bg-muted/20">
                  <td className="p-3 font-medium">{u.full_name || "—"}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{u.email}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-0.5 ${roleColor(u.role ?? "")}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {u.role === "doctor"
                      ? [u.department, u.specialization].filter(Boolean).join(" · ") || "—"
                      : "—"}
                  </td>
                  <td className="p-3 text-right font-mono text-xs text-muted-foreground">{u.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
              {(allUsers ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">No users yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}
