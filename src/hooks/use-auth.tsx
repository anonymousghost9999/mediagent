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
};

const Ctx = createContext<AuthCtx>({
  session: null, user: null, role: null, loading: true,
  signOut: async () => {},
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // defer DB call to avoid auth lock
        setTimeout(() => loadRole(s.user), 0);
      } else {
        setRole(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, role, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

export const roleHome = (r: AppRole | null) =>
  r === "doctor" ? "/doctor/dashboard"
  : r === "admin" ? "/admin/dashboard"
  : "/patient/dashboard";
