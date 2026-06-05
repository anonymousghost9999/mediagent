import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { patient, ongoing, timeline } from "@/lib/mediagent/data";
import {
  Activity, Calendar, ClipboardList, FileText, History, Sparkles,
  ArrowUpRight, Stethoscope, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/patient/dashboard")({ component: Page });

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Page() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["patient-dashboard-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, mrn, mobile, blood_group, height_cm, weight_kg")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: patientDetails } = useQuery({
    queryKey: ["patient-dashboard-details", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_details")
        .select("date_of_birth, gender, blood_group, chronic_conditions, known_allergies")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: consultations } = useQuery({
    queryKey: ["patient-dashboard-consultations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultations")
        .select("id,status,severity_score,created_at,assigned_doctor_id,hospital_id")
        .eq("patient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: latestEhr } = useQuery({
    queryKey: ["patient-dashboard-ehr", consultations?.[0]?.id],
    enabled: !!consultations?.[0]?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ehr_records")
        .select("diagnosis, approved_at, discharge_summary_url, created_at")
        .eq("consultation_id", consultations![0].id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const first = profile?.full_name?.split(" ")[0] ?? patient.fullName.split(" ")[0];
  const activeConsultation = consultations?.[0];
  const active = activeConsultation
    ? {
        diagnosis: latestEhr?.diagnosis ?? `Consultation ${activeConsultation.id}`,
        doctor: activeConsultation.assigned_doctor_id ? `Doctor ${activeConsultation.assigned_doctor_id.slice(0, 8)}` : "Assigned doctor pending",
        progress: latestEhr?.diagnosis ? `Live record loaded from Supabase for ${profile?.full_name ?? patient.fullName}.` : "Live consultation record loaded from Supabase.",
        nextAppt: activeConsultation.created_at ? new Date(activeConsultation.created_at).toLocaleDateString() : "—",
      }
    : ongoing[0];

  const liveTimeline = consultations?.map((consultation) => ({
    date: consultation.created_at?.slice(0, 10) ?? "—",
    type: consultation.status ?? "Consultation",
    title: consultation.id,
    doctor: consultation.assigned_doctor_id ? consultation.assigned_doctor_id.slice(0, 8) : "—",
  })) ?? timeline;

  const activeCount = consultations?.length ?? ongoing.length;

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        {/* Greeting */}
        <header className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>Your AI assistant is ready</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">
            {greeting()}, {first}.
          </h1>
          <p className="text-base text-muted-foreground">
            Here's a calm look at your health today.
          </p>
        </header>

        {/* Health Snapshot */}
        <section className="soft-card p-6 md:p-8 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
          <div className="relative grid gap-6 md:grid-cols-4">
            <div className="md:col-span-2 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active treatment</div>
              <div className="text-2xl font-semibold leading-tight">{active.diagnosis}</div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Stethoscope className="h-3.5 w-3.5" />
                <span>{active.doctor}</span>
              </div>
              <p className="text-sm text-foreground/80 pt-2">{active.progress}</p>
            </div>
            <Stat label="Severity" value="Medium" tone="warning" />
            <Stat label="Next review" value={active.nextAppt} sub={activeConsultation ? activeConsultation.status : "Demo fallback"} />
          </div>
        </section>

        {/* Primary CTA */}
        <section>
          <Link
            to="/patient/consultation/new"
            className="group block soft-card ai-glow p-6 md:p-8 hover:-translate-y-0.5 transition-transform"
          >
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inset-0 rounded-full bg-accent/50 pulse-dot" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
                  </span>
                  Start new consultation
                </div>
                <h2 className="text-2xl font-semibold mt-2">Talk to MediAgent</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Describe what's going on. The AI prepares a structured report for your doctor.
                </p>
              </div>
              <div className="hidden sm:grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground group-hover:scale-110 transition-transform">
                <ArrowUpRight className="h-6 w-6" />
              </div>
            </div>
          </Link>
        </section>

        {/* Three large cards */}
        <section className="grid gap-4 md:grid-cols-3">
          <BigCard
            to="/patient/timeline"
            icon={ClipboardList}
            label="Medical Timeline"
            value={`${liveTimeline.length} events`}
            sub="Visits, labs, prescriptions"
          />
          <BigCard
            to="/patient/treatments/ongoing"
            icon={Activity}
            label="Treatments"
            value={`${activeCount} active`}
            sub="Track progress & follow-ups"
          />
          <BigCard
            to="/patient/reports"
            icon={FileText}
            label="Reports"
            value="View all"
            sub="AI summaries & PDFs"
          />
        </section>

        {/* Footer reassurance */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Nothing becomes part of your record until your doctor approves.</span>
          <Link to="/patient/treatments/history" className="ml-auto inline-flex items-center gap-1 text-foreground/70 hover:text-foreground">
            <History className="h-3.5 w-3.5" /> History
          </Link>
          <Link to="/patient/profile" className="inline-flex items-center gap-1 text-foreground/70 hover:text-foreground">
            <Calendar className="h-3.5 w-3.5" /> Profile
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warning" | "accent" }) {
  const valueColor = tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function BigCard({
  to, icon: Icon, label, value, sub,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Link to={to} className="soft-card p-5 hover:border-accent/40 hover:shadow-md transition group">
      <div className="flex items-center justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent">
          <Icon className="h-5 w-5" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </Link>
  );
}
