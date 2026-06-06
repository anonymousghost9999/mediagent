import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, User, Activity, Stethoscope, ClipboardList, ChevronRight, SkipForward, CheckCircle2 } from "lucide-react";

type AppRole = "patient" | "doctor" | "admin";

interface Props {
  userId: string;
  role: AppRole;
  open: boolean;
  onComplete: () => void;
}

const STEPS_PATIENT = [
  { id: "basic", label: "Basic Info", icon: User, desc: "Tell us about yourself" },
  { id: "vitals", label: "Vitals", icon: Activity, desc: "Your body measurements" },
  { id: "medical", label: "Medical History", icon: ClipboardList, desc: "Conditions & insurance" },
];

const STEPS_DOCTOR = [
  { id: "basic", label: "Basic Info", icon: User, desc: "Your identity" },
  { id: "professional", label: "Professional", icon: Stethoscope, desc: "Your specialization" },
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
            i <= step ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function OnboardingModal({ userId, role, open, onComplete }: Props) {
  const steps = role === "doctor" ? STEPS_DOCTOR : STEPS_PATIENT;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form state for patient
  const [form, setForm] = useState({
    // Basic
    mobile: "",
    dob: "",
    gender: "",
    address: "",
    // Vitals (patient only)
    blood_group: "",
    height_cm: "",
    weight_kg: "",
    // Medical (patient only)
    allergies: "",
    chronic_conditions: "",
    emergency_contact: "",
    insurance_provider: "",
    insurance_number: "",
    // Professional (doctor only)
    department: "",
    specialization: "",
    license_number: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const saveStep = async () => {
    setSaving(true);
    try {
      const update: Record<string, any> = {};

      if (step === 0) {
        // Basic info — both roles
        if (form.mobile) update.mobile = form.mobile;
        if (form.dob) update.dob = form.dob;
        if (form.gender) update.gender = form.gender;
        if (form.address) update.address = form.address;
      } else if (step === 1 && role === "patient") {
        // Vitals
        if (form.blood_group) update.blood_group = form.blood_group;
        if (form.height_cm) update.height_cm = Number(form.height_cm);
        if (form.weight_kg) update.weight_kg = Number(form.weight_kg);
      } else if (step === 2 && role === "patient") {
        // Medical
        if (form.allergies) update.allergies = form.allergies.split(",").map((s) => s.trim()).filter(Boolean);
        if (form.chronic_conditions) update.chronic_conditions = form.chronic_conditions.split(",").map((s) => s.trim()).filter(Boolean);
        if (form.emergency_contact) update.emergency_contact = form.emergency_contact;
        if (form.insurance_provider) update.insurance_provider = form.insurance_provider;
        if (form.insurance_number) update.insurance_number = form.insurance_number;
      } else if (step === 1 && role === "doctor") {
        // Professional
        if (form.department) update.department = form.department;
        if (form.specialization) update.specialization = form.specialization;
        if (form.license_number) update.license_number = form.license_number;
      }

      if (Object.keys(update).length > 0) {
        const { error } = await supabase.from("profiles").update(update).eq("id", userId);
        if (error) throw error;
      }

      const isLast = step === steps.length - 1;
      if (isLast) {
        localStorage.setItem(`mediagent_onboarded_${userId}`, "1");
        toast.success("Profile set up! You're all set.");
        onComplete();
      } else {
        setStep((s) => s + 1);
      }
    } catch (err: any) {
      toast.error("Could not save", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const skipStep = () => {
    const isLast = step === steps.length - 1;
    if (isLast) {
      localStorage.setItem(`mediagent_onboarded_${userId}`, "1");
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  const currentStep = steps[step];
  const StepIcon = currentStep.icon;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg [&>button]:hidden">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <StepIcon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">{currentStep.label}</DialogTitle>
              <DialogDescription className="text-xs">{currentStep.desc}</DialogDescription>
            </div>
          </div>
          <ProgressBar step={step} total={steps.length} />
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* STEP 0 — Basic Info (both roles) */}
          {step === 0 && (
            <>
              <Field label="Mobile number" placeholder="+91 98XXX XXXXX">
                <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 98XXX XXXXX" />
              </Field>
              <Field label="Date of birth">
                <Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              </Field>
              <Field label="Gender">
                <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Non-binary">Non-binary</SelectItem>
                    <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Address">
                <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="City, State, Country" rows={2} />
              </Field>
            </>
          )}

          {/* STEP 1 — Vitals (patient) */}
          {step === 1 && role === "patient" && (
            <>
              <Field label="Blood group">
                <Select value={form.blood_group} onValueChange={(v) => set("blood_group", v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Height (cm)">
                  <Input type="number" min={0} max={260} value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} placeholder="170" />
                </Field>
                <Field label="Weight (kg)">
                  <Input type="number" min={0} max={400} value={form.weight_kg} onChange={(e) => set("weight_kg", e.target.value)} placeholder="70" />
                </Field>
              </div>
            </>
          )}

          {/* STEP 2 — Medical (patient) */}
          {step === 2 && role === "patient" && (
            <>
              <Field label="Allergies" hint="comma-separated, e.g. Penicillin, Pollen">
                <Textarea value={form.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Penicillin, Pollen" rows={2} />
              </Field>
              <Field label="Chronic conditions" hint="comma-separated, e.g. Asthma, Diabetes">
                <Textarea value={form.chronic_conditions} onChange={(e) => set("chronic_conditions", e.target.value)} placeholder="Asthma, Hypertension" rows={2} />
              </Field>
              <Field label="Emergency contact">
                <Input value={form.emergency_contact} onChange={(e) => set("emergency_contact", e.target.value)} placeholder="Name · Relation · Phone" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Insurance provider">
                  <Input value={form.insurance_provider} onChange={(e) => set("insurance_provider", e.target.value)} placeholder="Star Health" />
                </Field>
                <Field label="Insurance number">
                  <Input value={form.insurance_number} onChange={(e) => set("insurance_number", e.target.value)} placeholder="SH-XXXXX" />
                </Field>
              </div>
            </>
          )}

          {/* STEP 1 — Professional (doctor) */}
          {step === 1 && role === "doctor" && (
            <>
              <Field label="Department">
                <Input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Cardiology" />
              </Field>
              <Field label="Specialization">
                <Input value={form.specialization} onChange={(e) => set("specialization", e.target.value)} placeholder="e.g. Interventional Cardiologist" />
              </Field>
              <Field label="Medical license number">
                <Input value={form.license_number} onChange={(e) => set("license_number", e.target.value)} placeholder="MCI-XXXXX" />
              </Field>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={skipStep} className="text-muted-foreground">
            <SkipForward className="h-3.5 w-3.5 mr-1.5" />
            {step === steps.length - 1 ? "Skip & finish" : "Skip this step"}
          </Button>
          <Button onClick={saveStep} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : step === steps.length - 1 ? (
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-1.5" />
            )}
            {step === steps.length - 1 ? "Finish setup" : "Save & continue"}
          </Button>
        </div>

        <p className="text-[11px] text-center text-muted-foreground mt-1">
          Step {step + 1} of {steps.length} · You can always update this later in your profile.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label}
        {hint && <span className="ml-1.5 text-muted-foreground font-normal">({hint})</span>}
      </Label>
      {children}
    </div>
  );
}
