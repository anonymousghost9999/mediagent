import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "patient" | "doctor" | "admin";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signInDummy: (email: string, role: AppRole) => void;
};

const Ctx = createContext<AuthCtx>({
  session: null, user: null, role: null, loading: true,
  signOut: async () => {},
  signInDummy: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const roleFromUser = (user?: User | null) => {
    const rawRole = user?.user_metadata?.role;
    return rawRole === "doctor" || rawRole === "admin" || rawRole === "patient" ? rawRole : null;
  };

  useEffect(() => {
    const dummy = localStorage.getItem("mediagent_dummy_session");
    if (dummy) {
      try {
        const parsed = JSON.parse(dummy);
        setSession(parsed.session);
        setRole(parsed.role);
        setLoading(false);
        return;
      } catch (e) {
        localStorage.removeItem("mediagent_dummy_session");
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (localStorage.getItem("mediagent_dummy_session")) return;
      setSession(s);
      if (s?.user) {
        // defer DB call to avoid auth lock
        setTimeout(() => loadRole(s.user), 0);
      } else {
        setRole(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (localStorage.getItem("mediagent_dummy_session")) return;
      setSession(data.session);
      if (data.session?.user) loadRole(data.session.user);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadRole = async (user: User) => {
    const metadataRole = roleFromUser(user);
    if (metadataRole) {
      setRole(metadataRole);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    setRole((data?.role as AppRole) ?? null);
    setLoading(false);
  };

  const signInDummy = (email: string, chosenRole: AppRole) => {
    const dummyUser: User = {
      id: "dummy-user-id",
      email: email || "demo@mediagent.com",
      user_metadata: { role: chosenRole, full_name: "Demo User" },
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as any;

    const dummySession: Session = {
      access_token: "dummy-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "dummy-refresh-token",
      user: dummyUser,
    };

    localStorage.setItem("mediagent_dummy_session", JSON.stringify({ session: dummySession, role: chosenRole }));
    setSession(dummySession);
    setRole(chosenRole);
    setLoading(false);
  };

  const signOut = async () => {
    localStorage.removeItem("mediagent_dummy_session");
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
    setRole(null);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, role, loading, signOut, signInDummy }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export const roleHome = (r: AppRole | null) =>
  r === "doctor" ? "/doctor/dashboard"
  : r === "admin" ? "/admin/dashboard"
  : "/patient/dashboard";
