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
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { patient as defaultPatient } from "@/lib/mediagent/data";

export const Route = createFileRoute("/patient/profile")({ component: Page });

const schema = z.object({
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  mobile: z.string().trim().max(32).optional().or(z.literal("")),
  dob: z.string().optional().or(z.literal("")),
  gender: z.string().trim().max(16).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  blood_group: z.string().trim().max(8).optional().or(z.literal("")),
  height_cm: z.coerce.number().min(0).max(260).optional().or(z.literal("" as unknown as number)),
  weight_kg: z.coerce.number().min(0).max(400).optional().or(z.literal("" as unknown as number)),
  allergies: z.string().trim().max(500).optional().or(z.literal("")),
  chronic_conditions: z.string().trim().max(500).optional().or(z.literal("")),
  emergency_contact: z.string().trim().max(255).optional().or(z.literal("")),
  insurance_provider: z.string().trim().max(120).optional().or(z.literal("")),
  insurance_number: z.string().trim().max(64).optional().or(z.literal("")),
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

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["patient-profile", user?.id],
    enabled: !!user,
    queryFn: async () => getPatientProfile(user!.id),
  });

  const profile = data?.profile ?? {
    id: user?.id ?? defaultPatient.id,
    full_name: defaultPatient.fullName,
    email: defaultPatient.email,
    mobile: defaultPatient.mobile,
    dob: defaultPatient.dob,
    gender: defaultPatient.gender,
    address: defaultPatient.address,
    blood_group: defaultPatient.bloodGroup,
    height_cm: defaultPatient.heightCm,
    weight_kg: defaultPatient.weightKg,
    allergies: defaultPatient.allergies,
    chronic_conditions: defaultPatient.chronic,
    emergency_contact: defaultPatient.emergency,
    insurance_provider: defaultPatient.insurance,
    insurance_number: defaultPatient.insuranceNumber,
    mrn: defaultPatient.mrn,
  };
  const details = data?.details;

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
        blood_group: profile.blood_group ?? details?.blood_group ?? "",
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
      const parsed = schema.safeParse(draft);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const d = parsed.data;

      const { error } = await supabase.from("profiles").upsert({
        id: user!.id,
        full_name: d.full_name,
        email: d.email,
        mobile: d.mobile || null,
        dob: d.dob || null,
        gender: d.gender || null,
        address: d.address || null,
        blood_group: d.blood_group || null,
        height_cm: d.height_cm ? Number(d.height_cm) : null,
        weight_kg: d.weight_kg ? Number(d.weight_kg) : null,
        allergies: split(d.allergies),
        chronic_conditions: split(d.chronic_conditions),
        emergency_contact: d.emergency_contact || null,
        insurance_provider: d.insurance_provider || null,
        insurance_number: d.insurance_number || null,
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

  const F = ({ name, label, type = "text", textarea = false }: { name: string; label: string; type?: string; textarea?: boolean }) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <Textarea value={draft[name] ?? ""} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} />
      ) : (
        <Input type={type} value={draft[name] ?? ""} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} />
      )}
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Patient · Profile</div>
          <h1 className="text-2xl font-semibold">{profile.full_name || "Unnamed patient"}</h1>
          <p className="text-xs text-muted-foreground font-mono">MRN {profile.mrn}</p>
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
            <Row label="Blood group" value={profile.blood_group ?? details?.blood_group} />
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
            <F name="full_name" label="Full name" />
            <F name="email" label="Email" type="email" />
            <F name="mobile" label="Mobile" />
            <F name="dob" label="Date of birth" type="date" />
            <F name="gender" label="Gender" />
            <F name="address" label="Address" textarea />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Vitals</CardTitle></CardHeader><CardContent className="space-y-3">
            <F name="blood_group" label="Blood group" />
            <F name="height_cm" label="Height (cm)" type="number" />
            <F name="weight_kg" label="Weight (kg)" type="number" />
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Clinical</CardTitle></CardHeader><CardContent className="space-y-3">
            <F name="allergies" label="Allergies (comma-separated)" textarea />
            <F name="chronic_conditions" label="Chronic conditions (comma-separated)" textarea />
            <F name="emergency_contact" label="Emergency contact" />
            <F name="insurance_provider" label="Insurance provider" />
            <F name="insurance_number" label="Insurance number" />
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
