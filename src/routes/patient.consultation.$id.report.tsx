import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { patient } from "@/lib/mediagent/data";
import {
  Sparkles, AlertCircle, ChevronLeft, ShieldCheck, Activity,
  ClipboardList, Stethoscope, FileDown,
} from "lucide-react";

export const Route = createFileRoute("/patient/consultation/$id/report")({ component: Page });

const findings = [
  { label: "Likely picture", value: "Bronchospasm consistent with mild persistent asthma" },
  { label: "Differentials to rule out", value: "Viral bronchitis · GERD-related cough" },
  { label: "Recommended specialty", value: "Pulmonology" },
];

const timelinePoints = [
  { when: "2 days ago", text: "Onset of wheezing and dry cough, worse at night." },
  { when: "Yesterday", text: "Slight breathlessness on stairs. Used rescue inhaler ×3." },
  { when: "Today", text: "Symptoms persistent. No fever, no chest pain at rest." },
];

function Page() {
  const { id } = Route.useParams();
  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link to="/patient/consultation/$id" params={{ id }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to consultation
          </Link>
          <Button variant="outline" size="sm">
            <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download PDF
          </Button>
        </div>

        {/* Document */}
        <article className="soft-card p-8 md:p-12 space-y-10">
          {/* Header */}
          <header className="space-y-3 pb-6 border-b border-border/60">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Pre-consultation report
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {patient.fullName}
            </h1>
            <div className="text-sm text-muted-foreground font-mono">
              {patient.mrn} · {patient.age}y {patient.gender} · Generated {new Date().toLocaleString()}
            </div>
            <div className="inline-flex items-center gap-1.5 chip bg-warning/15 text-warning border border-warning/30 mt-1">
              <ShieldCheck className="h-3 w-3" /> Awaiting doctor review · not part of medical record yet
            </div>
          </header>

          {/* Patient summary */}
          <Section title="Patient summary" icon={ClipboardList}>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Item label="Allergies" value={patient.allergies.join(", ")} />
              <Item label="Chronic conditions" value={patient.chronic.join(", ")} />
              <Item label="Current medications" value={patient.currentMeds.join(", ")} />
              <Item label="Blood group" value={patient.bloodGroup} />
            </dl>
          </Section>

          {/* Symptoms timeline */}
          <Section title="Symptoms timeline" icon={Activity}>
            <ol className="space-y-4 border-l border-border/80 ml-1.5 pl-6">
              {timelinePoints.map((p, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{p.when}</div>
                  <div className="text-[15px] leading-relaxed mt-0.5">{p.text}</div>
                </li>
              ))}
            </ol>
          </Section>

          {/* AI findings */}
          <Section title="AI findings" icon={Sparkles} accent>
            <div className="space-y-4">
              {findings.map((f) => (
                <div key={f.label}>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{f.label}</div>
                  <div className="text-[15px] mt-1">{f.value}</div>
                </div>
              ))}
              <div className="text-[11px] text-muted-foreground pt-2 border-t border-border/60">
                AI confidence: 86% · these are suggestions for the reviewing physician, not a diagnosis.
              </div>
            </div>
          </Section>

          {/* Severity */}
          <Section title="Severity score" icon={AlertCircle}>
            <div className="flex items-end gap-6">
              <div>
                <div className="text-5xl font-semibold tracking-tight">3<span className="text-2xl text-muted-foreground">/5</span></div>
                <div className="text-sm text-warning font-medium mt-1">Medium priority</div>
              </div>
              <div className="flex-1 space-y-1.5 pb-2">
                {[1,2,3,4,5].map((n) => (
                  <div key={n} className={`h-1.5 rounded-full ${n <= 3 ? "bg-warning" : "bg-border"}`} />
                ))}
              </div>
            </div>
          </Section>

          {/* Recommendation */}
          <Section title="Recommended doctor review" icon={Stethoscope}>
            <p className="text-[15px] leading-relaxed">
              Suggested for review by a <b>pulmonologist</b> within the next 24 hours.
              Please confirm rescue inhaler usage and consider stepping up controller therapy.
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
