import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight, ChevronDown, ChevronUp, Clock, CalendarDays, Stethoscope, FileText, CheckCircle2, CircleDot, AlertCircle, Loader2,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/patient/treatments/history")({ component: Page });

type Consultation = {
  id: string;
  status: string;
  severity_score: number | null;
  created_at: string;
  chief_complaint: string | null;
  intake_summary: string | null;
  record_name: string | null;
  assigned_doctor_id: string | null;
};

type Treatment = {
  label: string;
  consultations: Consultation[];
};

// Group consultations into "treatments" by chief complaint prefix
function groupIntoTreatments(consultations: Consultation[]): Treatment[] {
  const map = new Map<string, Consultation[]>();
  for (const c of consultations) {
    // Parse chief complaint from intake_summary if not in chief_complaint field
    let complaint = c.chief_complaint || "";
    if (!complaint && c.intake_summary) {
      try {
        const p = JSON.parse(c.intake_summary);
        complaint = p.primary_issue || p.english_symptoms || "";
      } catch {}
    }
    // Remove "Follow-up: " prefix to group under same treatment
    const baseLabel = complaint.replace(/^Follow-up:\s*/i, "").trim() || `Consultation ${c.id.slice(0, 8)}`;
    if (!map.has(baseLabel)) map.set(baseLabel, []);
    map.get(baseLabel)!.push(c);
  }
  return Array.from(map.entries()).map(([label, consultations]) => ({
    label,
    consultations: consultations.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  }));
}

function statusInfo(status: string) {
  switch (status) {
    case "completed": return { label: "Finalized EHR", color: "bg-green-500/15 text-green-700 border-green-500/30", icon: CheckCircle2 };
    case "waiting": return { label: "Awaiting doctor", color: "bg-amber-500/15 text-amber-700 border-amber-500/30", icon: CircleDot };
    case "follow_up_requested": return { label: "Follow-up requested", color: "bg-blue-500/15 text-blue-700 border-blue-500/30", icon: AlertCircle };
    default: return { label: status.replace(/_/g, " "), color: "bg-muted text-muted-foreground border-border", icon: CircleDot };
  }
}

function TreatmentCard({ treatment, doctorNames }: { treatment: Treatment; doctorNames: Map<string, string> }) {
  const [expanded, setExpanded] = useState(true);
  const latest = treatment.consultations[0];
  const latestStatus = statusInfo(latest.status);
  const StatusIcon = latestStatus.icon;

  return (
    <Card className="overflow-hidden">
      {/* Treatment header — click to expand/collapse */}
      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Stethoscope className="h-4 w-4 text-accent shrink-0" />
              <CardTitle className="text-base truncate">{treatment.label}</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {treatment.consultations.length} consultation{treatment.consultations.length > 1 ? "s" : ""}
              </span>
              <span>·</span>
              <span>Last: {latest.created_at?.slice(0, 10)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full border px-2.5 py-0.5 ${latestStatus.color}`}>
              <StatusIcon className="h-3 w-3" />
              {latestStatus.label}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {/* Consultation list */}
      {expanded && (
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {treatment.consultations.map((c, idx) => {
              const info = statusInfo(c.status);
              const Icon = info.icon;
              const doctorName = c.assigned_doctor_id
                ? (doctorNames.get(c.assigned_doctor_id) ?? `Dr. ${c.assigned_doctor_id.slice(0, 6)}`)
                : "Unassigned";
              const isFollowUp = (c.chief_complaint ?? "").startsWith("Follow-up:");
              return (
                <div key={c.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center shrink-0 self-stretch">
                    <div className={`h-2.5 w-2.5 rounded-full mt-2 ${c.status === "completed" ? "bg-green-500" : c.status === "waiting" ? "bg-amber-500 animate-pulse" : "bg-accent"}`} />
                    {idx < treatment.consultations.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                        {c.record_name ?? c.id.slice(0, 8)}
                      </span>
                      {isFollowUp && (
                        <span className="text-[10px] font-medium text-blue-600 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded">Follow-up</span>
                      )}
                      {idx === treatment.consultations.length - 1 && (
                        <span className="text-[10px] font-medium text-muted-foreground">Initial</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.created_at?.slice(0, 10)}</span>
                      <span>·</span>
                      <span>{doctorName}</span>
                    </div>
                  </div>

                  {/* Status + action */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium rounded-full border px-2 py-0.5 ${info.color}`}>
                      <Icon className="h-2.5 w-2.5" />
                      {info.label}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                      <Link to="/patient/treatments/history/$id" params={{ id: c.id }}>
                        <FileText className="h-3.5 w-3.5 mr-1" />Details <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Page() {
  const { user } = useAuth();

  const { data: consultations, isLoading } = useQuery({
    queryKey: ["patient-history-consultations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultations")
        .select("id, status, severity_score, created_at, chief_complaint, intake_summary, record_name, assigned_doctor_id")
        .eq("patient_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Consultation[];
    },
  });

  // Fetch doctor names for assigned IDs
  const doctorIds = [...new Set((consultations ?? []).map((c) => c.assigned_doctor_id).filter(Boolean))] as string[];
  const { data: doctors } = useQuery({
    queryKey: ["doctor-names", doctorIds.join(",")],
    enabled: doctorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", doctorIds);
      return data ?? [];
    },
  });
  const doctorNames = new Map((doctors ?? []).map((d) => [d.id, d.full_name ? `Dr. ${d.full_name.replace(/^Dr\.\s*/i, "")}` : d.id.slice(0, 8)]));

  const treatments = groupIntoTreatments(consultations ?? []);

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <header>
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Treatment history</div>
        <h1 className="text-2xl font-semibold">My treatments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Each card is a treatment. Expand to see all consultations. Click <strong>Details</strong> on any row to view the full record.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your treatments…
        </div>
      ) : treatments.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm border-dashed">
          No consultations yet. Start a new consultation to see your history here.
        </Card>
      ) : (
        <div className="space-y-4">
          {treatments.map((t) => (
            <TreatmentCard key={t.label} treatment={t} doctorNames={doctorNames} />
          ))}
        </div>
      )}
    </div>
  );
}
