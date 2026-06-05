import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, persistSession, roleHome, type AppRole } from "@/hooks/use-auth";
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

function AuthPage() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session && role) {
      navigate({ to: roleHome(role), replace: true });
    }
  }, [session, role, loading, navigate]);

  /* ─── Sign in ─────────────────────────────────────────────────── */
  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = (fd.get("email") as string).trim();
    const password = fd.get("password") as string;

    if (!email || !password) return toast.error("Email and password are required");
    setBusy(true);

    try {
      // Fetch the profile row by email
      const { data: rows, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, password, role")
        .eq("email", email)
        .limit(1);

      if (error) throw error;

      const profile = rows?.[0];
      if (!profile) throw new Error("No account found with that email");

      // Plain string comparison — no hashing
      if (profile.password !== password) throw new Error("Incorrect password");

      const user = persistSession(profile);
      navigate({ to: roleHome(user.role), replace: true });
      toast.success(`Welcome back, ${user.full_name || user.email}`);
    } catch (err: any) {
      toast.error("Sign in failed", { description: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

  /* ─── Sign up ─────────────────────────────────────────────────── */
  const onSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fullName = (fd.get("fullName") as string).trim();
    const email = (fd.get("email") as string).trim();
    const password = fd.get("password") as string;
    const role = (fd.get("role") as string) || "patient";

    if (!email || !password) return toast.error("Email and password are required");
    setBusy(true);

    try {
      // Check if email already taken
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(1);

      if (existing && existing.length > 0) throw new Error("An account with that email already exists");

      // Insert new profile — password stored as plain text
      const { data: rows, error } = await supabase
        .from("profiles")
        .insert({
          full_name: fullName || email.split("@")[0],
          email,
          password,
          role,
        })
        .select("id, full_name, email, role")
        .single();

      if (error) throw error;
      if (!rows) throw new Error("Failed to create account");

      const user = persistSession(rows);
      toast.success("Account created!");
      navigate({ to: roleHome(user.role), replace: true });
    } catch (err: any) {
      toast.error("Sign up failed", { description: err.message || String(err) });
    } finally {
      setBusy(false);
    }
  };

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

            {/* ── Sign In ── */}
            <TabsContent value="signin">
              <form onSubmit={onSignIn} className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" name="email" type="text" autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="si-password">Password</Label>
                  <Input id="si-password" name="password" type="password" autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Sign in
                </Button>
              </form>
            </TabsContent>

            {/* ── Sign Up ── */}
            <TabsContent value="signup">
              <form onSubmit={onSignUp} className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" name="fullName" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" name="email" type="text" autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="su-password">Password</Label>
                  <Input id="su-password" name="password" type="password" />
                </div>
                <div className="space-y-1.5">
                  <Label>I am a…</Label>
                  <Select name="role" defaultValue="patient">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="patient"><div className="flex items-center gap-2"><UserRound className="h-4 w-4" />Patient</div></SelectItem>
                      <SelectItem value="doctor"><div className="flex items-center gap-2"><Stethoscope className="h-4 w-4" />Doctor</div></SelectItem>
                      <SelectItem value="admin"><div className="flex items-center gap-2"><Shield className="h-4 w-4" />Admin</div></SelectItem>
                    </SelectContent>
                  </Select>
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
