import { cn } from "@/lib/utils";
import type { Severity, ReviewStatus } from "@/lib/mediagent/data";
import { severityLabel } from "@/lib/mediagent/data";

export function SeverityChip({ level }: { level: Severity }) {
  const bg = {
    1: "bg-sev-1/40 text-foreground",
    2: "bg-sev-2/40 text-foreground",
    3: "bg-sev-3/50 text-foreground",
    4: "bg-sev-4/60 text-foreground",
    5: "bg-sev-5 text-destructive-foreground",
  }[level];
  return (
    <span className={cn("chip font-mono", bg)}>
      <span className="font-semibold">{level}</span>
      {severityLabel[level]}
    </span>
  );
}

export function StatusPill({ status }: { status: ReviewStatus | string }) {
  const map: Record<string, string> = {
    PENDING_REVIEW: "bg-warning/15 text-foreground border border-warning/40",
    APPROVED: "bg-success/15 text-foreground border border-success/40",
    MODIFIED_AND_APPROVED: "bg-accent-soft text-foreground border border-accent/50",
    REJECTED: "bg-destructive/10 text-foreground border border-destructive/40",
    DRAFT: "bg-muted text-muted-foreground border border-border",
    FINALIZED: "bg-primary/10 text-foreground border border-primary/40",
    ACTIVE: "bg-success/15 text-foreground border border-success/40",
  };
  return (
    <span className={cn("chip uppercase tracking-wide", map[status] ?? "bg-muted")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function DraftBadge() {
  return (
    <span className="chip bg-warning/20 text-foreground border border-warning/50 font-mono">
      ● DRAFT — requires doctor approval
    </span>
  );
}
