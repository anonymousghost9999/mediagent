import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getConsultationById } from "@/lib/mediagent/live";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { patient } from "@/lib/mediagent/data";
import {
  Sparkles, AlertCircle, ChevronLeft, ShieldCheck, Activity,
  ClipboardList, Stethoscope, FileDown,
} from "lucide-react";

export const Route = createFileRoute("/patient/consultation/$id/report")({ component: Page });

function Page() {
  const { id } = Route.useParams();

  // Load live patient profile from Supabase
  const { data } = useQuery({
    queryKey: ["patient-consultation-report", id],
    queryFn: async () => getConsultationById(id),
  });
  const profile = data?.profile;
  const details = data?.details;

  // Load intake report from localStorage (set by Patient Agent after intake)
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`mediagent_report_${id}`);
    if (stored) {
      try {
        setReport(JSON.parse(stored));
      } catch (err) {
        console.error("Failed to parse stored report", err);
      }
    }
  }, [id]);

  // Fallback data if page is accessed directly without intake report
  const isFallback = !report;
  const severityScore = report?.severity_score ?? 3;
  const organSystem = report?.organ_system ?? "Pulmonology";
  const triageRationale = report?.triage_rationale ?? "Suggested for review by a pulmonologist within the next 24 hours. Please confirm rescue inhaler usage.";
  
  const differentials = report?.differential_diagnoses ?? [
    { condition: "Bronchospasm consistent with mild persistent asthma", probability: "High", rationale: "Consistent with wheezing history" },
    { condition: "Viral bronchitis", probability: "Medium", rationale: "Rule out secondary to recent cold" },
    { condition: "GERD-related cough", probability: "Low", rationale: "Evaluate acid reflux triggers" }
  ];

  const getPriorityLabel = (score: number) => {
    if (score <= 2) return { text: "Emergency / Emergent", color: "text-destructive", bg: "bg-destructive/15 border-destructive/30" };
    if (score === 3) return { text: "Urgent / Medium Priority", color: "text-warning", bg: "bg-warning/15 border-warning/30" };
    return { text: "Less Urgent / Low Priority", color: "text-success", bg: "bg-success/15 border-success/30" };
  };

  const priority = getPriorityLabel(severityScore);

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link to="/patient/consultation/$id" params={{ id }} search={{ lang: "en", mode: "chat" }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to consultation
          </Link>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <FileDown className="h-3.5 w-3.5 mr-1.5" /> Print Report
          </Button>
        </div>

        {/* Document */}
        <article className="soft-card p-8 md:p-12 space-y-10">
          {/* Header */}
          <header className="space-y-3 pb-6 border-b border-border/60">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Pre-consultation report {isFallback && "(Demo Mock)"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {profile?.full_name ?? patient.fullName}
            </h1>
            <div className="text-sm text-muted-foreground font-mono">
              {profile?.mrn ?? patient.mrn} · {profile?.dob ? `${new Date().getFullYear() - new Date(profile.dob).getFullYear()}y` : `${patient.age}y`} {(details as any)?.gender ?? (profile as any)?.gender ?? patient.gender} · Generated {new Date().toLocaleString()}
            </div>
            <div className="inline-flex items-center gap-1.5 chip bg-warning/15 text-warning border border-warning/30 mt-1">
              <ShieldCheck className="h-3 w-3" /> Awaiting doctor review · not part of medical record yet
            </div>
          </header>

          {/* Patient summary */}
          <Section title="Patient summary" icon={ClipboardList}>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Item label="Allergies" value={((details as any)?.known_allergies as string[] | undefined)?.join(", ") ?? patient.allergies.join(", ")} />
              <Item label="Chronic conditions" value={((details as any)?.chronic_conditions as string[] | undefined)?.join(", ") ?? patient.chronic.join(", ")} />
              <Item label="Current medications" value={((profile as any)?.current_meds as string[] | undefined)?.join(", ") ?? patient.currentMeds.join(", ")} />
              <Item label="Blood group" value={(details as any)?.blood_group ?? (profile as any)?.blood_group ?? patient.bloodGroup} />
            </dl>
          </Section>

          {/* Symptoms timeline */}
          <Section title="Symptoms timeline" icon={Activity}>
            <ol className="space-y-4 border-l border-border/80 ml-1.5 pl-6">
              <li className="relative">
                <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Captured Symptoms (English)</div>
                <div className="text-[15px] leading-relaxed mt-0.5 font-medium">
                  {report?.english_translation ?? "Wheezing & cough × 2 days, worse at night."}
                </div>
              </li>
              {report?.original_language !== "en-IN" && report?.original_transcript && (
                <li className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent-soft border border-accent" />
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Original Script ({report.original_language})</div>
                  <div className="text-[15px] leading-relaxed mt-0.5 italic text-muted-foreground">
                    "{report.original_transcript}"
                  </div>
                </li>
              )}
            </ol>
          </Section>

          {/* AI findings */}
          <Section title="AI findings" icon={Sparkles} accent>
            <div className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Differential Diagnoses & Reasoning</div>
                <div className="mt-2 space-y-3">
                  {differentials.map((diff: any, idx: number) => (
                    <div key={idx} className="bg-muted/30 p-3 rounded-md border border-border/40">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{diff.condition}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono uppercase font-bold ${
                          diff.probability === "High" ? "bg-destructive/10 text-destructive" :
                          diff.probability === "Medium" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                        }`}>{diff.probability} probability</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{diff.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/60">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Recommended Specialty</div>
                  <div className="text-sm font-semibold mt-0.5">{organSystem}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Original Language</div>
                  <div className="text-sm font-mono mt-0.5">{report?.original_language ?? "en-IN"}</div>
                </div>
              </div>
            </div>
          </Section>

          {/* Severity */}
          <Section title="Severity score (ESI)" icon={AlertCircle}>
            <div className="flex items-end gap-6">
              <div>
                <div className="text-5xl font-semibold tracking-tight">
                  {severityScore}
                  <span className="text-2xl text-muted-foreground">/5</span>
                </div>
                <div className={`text-sm font-medium mt-1 ${priority.color}`}>
                  {priority.text}
                </div>
              </div>
              <div className="flex-1 space-y-1.5 pb-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className={`h-2 flex-1 rounded-full ${
                        n <= (6 - severityScore) // ESI 1 is most severe, ESI 5 is least. Scale: 6 - score highlights the risk blocks.
                          ? severityScore <= 2 ? "bg-destructive" : severityScore === 3 ? "bg-warning" : "bg-success"
                          : "bg-border"
                      }`}
                    />
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground flex justify-between">
                  <span>High severity (ESI-1)</span>
                  <span>Low severity (ESI-5)</span>
                </div>
              </div>
            </div>
          </Section>

          {/* Recommendation */}
          <Section title="Triage Rationale & Recommendations" icon={Stethoscope}>
            <p className="text-[15px] leading-relaxed whitespace-pre-line">
              {triageRationale}
            </p>
          </Section>
        </article>

        <div className="text-center text-xs text-muted-foreground">
          You'll be notified once your doctor reviews this report.
        </div>
      </div>
    </div>
  );
}

function Section({
  title, icon: Icon, accent, children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className={`flex items-center gap-2 text-sm font-semibold ${accent ? "text-accent" : ""}`}>
        <Icon className="h-4 w-4" />
        {title}
      </div>
      {children}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{value}</dd>
    </div>
  );
}

