import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { getPatientProfile } from "@/lib/mediagent/live";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, Save, X, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/patient/profile")({ component: Page });

const schema = z.object({
  full_name: z.string().optional().default(""),
  email: z.string().optional().default(""),
  mobile: z.string().optional().default(""),
  dob: z.string().optional().default(""),
  gender: z.string().optional().default(""),
  address: z.string().optional().default(""),
  blood_group: z.string().optional().default(""),
  height_cm: z.string().optional().default(""),
  weight_kg: z.string().optional().default(""),
  allergies: z.string().optional().default(""),
  chronic_conditions: z.string().optional().default(""),
  emergency_contact: z.string().optional().default(""),
  insurance_provider: z.string().optional().default(""),
  insurance_number: z.string().optional().default(""),
});

const csv = (a: string[] | null | undefined) => (a ?? []).join(", ");
const split = (s?: string) => (s ?? "").split(",").map((t) => t.trim()).filter(Boolean);

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-all">{value || "—"}</span>
    </div>
  );
}

function F({
  name, label, type = "text", textarea = false, draft, setDraft,
}: {
  name: string;
  label: string;
  type?: string;
  textarea?: boolean;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea
          value={draft[name] ?? ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, [name]: e.target.value }))}
        />
      ) : (
        <Input
          type={type}
          value={draft[name] ?? ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, [name]: e.target.value }))}
        />
      )}
    </div>
  );
}

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["patient-profile", user?.id],
    enabled: !!user,
    queryFn: async () => getPatientProfile(user!.id),
  });

  const profile = data?.profile ?? {
    id: user?.id ?? "",
    full_name: user?.full_name ?? "",
    email: user?.email ?? "",
    mobile: null,
    dob: null,
    gender: null,
    address: null,
    blood_group: null,
    height_cm: null,
    weight_kg: null,
    allergies: null,
    chronic_conditions: null,
    emergency_contact: null,
    insurance_provider: null,
    insurance_number: null,
    mrn: null,
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDraft({
        full_name: profile.full_name ?? "",
        email: profile.email ?? user?.email ?? "",
        mobile: profile.mobile ?? "",
        dob: profile.dob ?? "",
        gender: profile.gender ?? "",
        address: profile.address ?? "",
        blood_group: profile.blood_group ?? "",
        height_cm: profile.height_cm?.toString() ?? "",
        weight_kg: profile.weight_kg?.toString() ?? "",
        allergies: csv(profile.allergies),
        chronic_conditions: csv(profile.chronic_conditions),
        emergency_contact: profile.emergency_contact ?? "",
        insurance_provider: profile.insurance_provider ?? "",
        insurance_number: profile.insurance_number ?? "",
      });
    }
  }, [profile, user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase.from("profiles").upsert({
        id: user!.id,
        full_name: draft.full_name || null,
        email: draft.email || null,
        mobile: draft.mobile || null,
        dob: draft.dob || null,
        gender: draft.gender || null,
        address: draft.address || null,
        blood_group: draft.blood_group || null,
        height_cm: draft.height_cm ? Number(draft.height_cm) : null,
        weight_kg: draft.weight_kg ? Number(draft.weight_kg) : null,
        allergies: split(draft.allergies),
        chronic_conditions: split(draft.chronic_conditions),
        emergency_contact: draft.emergency_contact || null,
        insurance_provider: draft.insurance_provider || null,
        insurance_number: draft.insurance_number || null,
        role: user?.role || "patient",
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["patient-profile", user?.id] });
      setEditing(false);
      toast.success("Profile updated");
    } catch (e: any) {
      toast.error("Could not save", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !profile) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading profile…</div>;
  }

  const bmi = profile.height_cm && profile.weight_kg
    ? Math.round((Number(profile.weight_kg) / Math.pow(Number(profile.height_cm) / 100, 2)) * 10) / 10
    : null;


  const missingFields = !profile.mobile && !profile.dob && !profile.gender;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Profile</div>
          <h1 className="text-2xl font-semibold">{profile.full_name || "Unnamed patient"}</h1>
          <p className="text-xs text-muted-foreground font-mono">MRN {profile.mrn || "—"}</p>
        </div>
        {!editing ? (
          <Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1.5" />Edit profile</Button>
        ) : (
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1.5" />Cancel</Button>
          </div>
        )}
      </header>

      {missingFields && !editing && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-amber-600 dark:text-amber-400">Profile incomplete</div>
            <div className="text-muted-foreground text-xs mt-0.5">Complete your profile for more accurate AI consultations — your doctor will see this data.</div>
          </div>
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => setEditing(true)}>Complete now</Button>
        </div>
      )}

      {!editing ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle>Identity</CardTitle></CardHeader><CardContent>
            <Row label="Full name" value={profile.full_name} />
            <Row label="Email" value={profile.email} />
            <Row label="Mobile" value={profile.mobile} />
            <Row label="DOB" value={profile.dob} />
            <Row label="Gender" value={profile.gender} />
            <Row label="Address" value={profile.address} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Vitals</CardTitle></CardHeader><CardContent>
            <Row label="Blood group" value={profile.blood_group} />
            <Row label="Height" value={profile.height_cm ? `${profile.height_cm} cm` : "—"} />
            <Row label="Weight" value={profile.weight_kg ? `${profile.weight_kg} kg` : "—"} />
            <Row label="BMI" value={bmi ?? "—"} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Clinical</CardTitle></CardHeader><CardContent>
            <Row label="Allergies" value={csv(profile.allergies)} />
            <Row label="Chronic" value={csv(profile.chronic_conditions)} />
            <Row label="Emergency" value={profile.emergency_contact} />
            <Row label="Insurance" value={[profile.insurance_provider, profile.insurance_number].filter(Boolean).join(" · ")} />
          </CardContent></Card>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle>Identity</CardTitle></CardHeader><CardContent className="space-y-3">
            <F name="full_name" label="Full name" draft={draft} setDraft={setDraft} />
            <F name="email" label="Email" type="email" draft={draft} setDraft={setDraft} />
            <F name="mobile" label="Mobile" draft={draft} setDraft={setDraft} />
            <F name="dob" label="Date of birth" type="date" draft={draft} setDraft={setDraft} />
            <F name="gender" label="Gender" draft={draft} setDraft={setDraft} />
            <F name="address" label="Address" textarea draft={draft} setDraft={setDraft} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Vitals</CardTitle></CardHeader><CardContent className="space-y-3">
            <F name="blood_group" label="Blood group" draft={draft} setDraft={setDraft} />
            <F name="height_cm" label="Height (cm)" type="number" draft={draft} setDraft={setDraft} />
            <F name="weight_kg" label="Weight (kg)" type="number" draft={draft} setDraft={setDraft} />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Clinical</CardTitle></CardHeader><CardContent className="space-y-3">
            <F name="allergies" label="Allergies (comma-separated)" textarea draft={draft} setDraft={setDraft} />
            <F name="chronic_conditions" label="Chronic conditions (comma-separated)" textarea draft={draft} setDraft={setDraft} />
            <F name="emergency_contact" label="Emergency contact" draft={draft} setDraft={setDraft} />
            <F name="insurance_provider" label="Insurance provider" draft={draft} setDraft={setDraft} />
            <F name="insurance_number" label="Insurance number" draft={draft} setDraft={setDraft} />
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
