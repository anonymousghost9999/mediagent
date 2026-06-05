import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { imReportSchema, type IMReportData } from "@/lib/mediagent/im-report";

type Props = {
  value: IMReportData;
  onChange: (v: IMReportData) => void;
  readOnly?: boolean;
};

export function IMReportForm({ value, onChange, readOnly }: Props) {
  const set = (id: string, v: string | string[]) => onChange({ ...value, [id]: v });

  return (
    <div className="space-y-4">
      {imReportSchema.map((section) => (
        <Card key={section.id} className="p-4 space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">{section.title}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {section.fields.map((f) => {
              const v = value[f.id];
              return (
                <div key={f.id} className={f.type === "textarea" ? "md:col-span-2 space-y-1.5" : "space-y-1.5"}>
                  <Label className="text-xs">{f.label}</Label>
                  {f.type === "text" && (
                    <Input
                      disabled={readOnly}
                      value={(v as string) ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.id, e.target.value)}
                    />
                  )}
                  {f.type === "textarea" && (
                    <Textarea
                      disabled={readOnly}
                      value={(v as string) ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.id, e.target.value)}
                    />
                  )}
                  {f.type === "select" && (
                    <Select
                      disabled={readOnly}
                      value={(v as string) ?? ""}
                      onValueChange={(nv) => set(f.id, nv)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {f.type === "radio" && (
                    <RadioGroup
                      disabled={readOnly}
                      value={(v as string) ?? ""}
                      onValueChange={(nv) => set(f.id, nv)}
                      className="flex flex-wrap gap-3 pt-1"
                    >
                      {f.options.map((o) => (
                        <label key={o} className="flex items-center gap-1.5 text-sm">
                          <RadioGroupItem value={o} /> {o}
                        </label>
                      ))}
                    </RadioGroup>
                  )}
                  {f.type === "checkbox" && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {f.options.map((o) => {
                        const arr = Array.isArray(v) ? v : [];
                        const checked = arr.includes(o);
                        return (
                          <label key={o} className="flex items-center gap-1.5 text-sm">
                            <Checkbox
                              disabled={readOnly}
                              checked={checked}
                              onCheckedChange={(c) => {
                                const next = c ? [...arr, o] : arr.filter((x) => x !== o);
                                set(f.id, next);
                              }}
                            />
                            {o}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

// PDF export via the browser's native print dialog (no extra dependency).
export function downloadReportAsPDF(opts: {
  title: string;
  patientName: string;
  patientMrn: string;
  doctor: string;
  data: IMReportData;
  extras?: Record<string, string>;
}) {
  const rows = imReportSchema
    .flatMap((s) =>
      s.fields.map((f) => {
        const v = opts.data[f.id];
        const display = Array.isArray(v) ? v.join(", ") : (v ?? "");
        return `<tr><td style="padding:6px 10px;color:#666;width:35%;border-bottom:1px solid #eee">${s.title} · ${f.label}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${display || "—"}</td></tr>`;
      }),
    )
    .join("");
  const extras = Object.entries(opts.extras ?? {})
    .map(([k, v]) => `<tr><td style="padding:6px 10px;color:#666;border-bottom:1px solid #eee">${k}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${v}</td></tr>`)
    .join("");

  const html = `<!doctype html><html><head><title>${opts.title}</title>
  <style>body{font-family:ui-sans-serif,system-ui;color:#111;padding:32px;max-width:780px;margin:auto}
  h1{font-size:20px;margin:0 0 4px}.muted{color:#666;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
  .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #0d9488;padding-bottom:8px}</style></head>
  <body><div class="head"><div><h1>${opts.title}</h1><div class="muted">MediAgent · Internal Medicine Report</div></div>
  <div class="muted">${new Date().toLocaleString()}</div></div>
  <table><tr><td style="padding:6px 10px;color:#666">Patient</td><td style="padding:6px 10px">${opts.patientName} (${opts.patientMrn})</td></tr>
  <tr><td style="padding:6px 10px;color:#666">Doctor</td><td style="padding:6px 10px">${opts.doctor}</td></tr>${extras}${rows}</table>
  <p class="muted" style="margin-top:24px">Generated by MediAgent. All AI-suggested content has been reviewed and approved by the attending physician.</p>
  <script>window.onload=()=>{window.print()}</script></body></html>`;

  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
