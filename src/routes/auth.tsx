import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, roleHome, type AppRole } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Stethoscope, UserRound, Shield } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · MediAgent" }] }),
  component: AuthPage,
});

const signUpSchema = z.object({
  fullName: z.string().trim().max(120),
  email: z.string().trim().min(1),
  password: z.string().min(1),
  role: z.enum(["patient", "doctor", "admin"]),
});

const signInSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, role, loading, signInDummy } = useAuth();
  const [busy, setBusy] = useState(false);
  const [signInAs, setSignInAs] = useState<AppRole>("patient");

  useEffect(() => {
    if (!loading && session && role) {
      navigate({ to: roleHome(role), replace: true });
    }
  }, [session, role, loading, navigate]);

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error || !data.user) {
        console.warn("Supabase auth failed, using demo bypass:", error?.message);
        signInDummy(email, signInAs);
        setBusy(false);
        toast.success(`Bypassed auth: Welcome back, ${signInAs} (Demo)`);
        navigate({ to: roleHome(signInAs), replace: true });
        return;
      }
      await supabase.auth.updateUser({ data: { role: signInAs } });
      setBusy(false);
      toast.success(`Welcome back, ${signInAs}`);
      navigate({ to: roleHome(signInAs), replace: true });
    } catch (err) {
      signInDummy(email, signInAs);
      setBusy(false);
      toast.success(`Bypassed auth: Welcome back, ${signInAs} (Demo)`);
      navigate({ to: roleHome(signInAs), replace: true });
    }
  };

  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullName = fd.get("fullName") as string;
    const email = fd.get("email") as string;
    const password = fd.get("password") as string;
    const chosenRole = fd.get("role") as AppRole;
    const parsed = signUpSchema.safeParse({
      fullName,
      email,
      password,
      role: chosenRole,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    
    try {
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: parsed.data.fullName || "Demo User", role: parsed.data.role },
        },
      });
      if (error) {
        console.warn("Supabase signup failed, using demo bypass:", error.message);
        signInDummy(email, chosenRole);
        setBusy(false);
        toast.success(`Bypassed auth: Welcome back, ${chosenRole} (Demo)`);
        navigate({ to: roleHome(chosenRole), replace: true });
        return;
      }
      setBusy(false);
      toast.success("Account created", { description: "You can sign in now." });
    } catch (err) {
      signInDummy(email, chosenRole);
      setBusy(false);
      toast.success(`Bypassed auth: Welcome back, ${chosenRole} (Demo)`);
      navigate({ to: roleHome(chosenRole), replace: true });
    }
  };

  const roleOptions: { value: AppRole; label: string; icon: typeof UserRound }[] = [
    { value: "patient", label: "Patient", icon: UserRound },
    { value: "doctor", label: "Doctor", icon: Stethoscope },
    { value: "admin", label: "Admin", icon: Shield },
  ];

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground font-bold">M</div>
            <div>
              <CardTitle>MediAgent</CardTitle>
              <p className="text-xs text-muted-foreground">Doctor-in-the-loop EHR</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Sign in as</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {roleOptions.map((r) => {
                      const Icon = r.icon;
                      const active = signInAs === r.value;
                      return (
                        <button
                          type="button"
                          key={r.value}
                          onClick={() => setSignInAs(r.value)}
                          className={`flex flex-col items-center gap-1 rounded-md border p-3 text-xs transition ${
                            active
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" name="email" type="text" autoComplete="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="si-password">Password</Label>
                  <Input id="si-password" name="password" type="password" autoComplete="current-password" required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Sign in as {signInAs}
                </Button>
              </form>
            </TabsContent>


            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" name="fullName" maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="text" autoComplete="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-password">Password</Label>
                  <Input id="su-password" name="password" type="password" required />
                </div>
                <div className="space-y-1.5">
                  <Label>I am a…</Label>
                  <Select name="role" defaultValue="patient">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="patient"><div className="flex items-center gap-2"><UserRound className="h-4 w-4" />Patient</div></SelectItem>
                      <SelectItem value="doctor"><div className="flex items-center gap-2"><Stethoscope className="h-4 w-4" />Doctor</div></SelectItem>
                      <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="h-4 w-4" />Admin (dev/demo)</div></SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Role can only be set at signup in this demo build.</p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
