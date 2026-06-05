import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppRole = "patient" | "doctor" | "admin";

/** The shape stored in localStorage and exposed via context. */
export type AppUser = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  /** Compatibility shim so existing components can read user.user_metadata.role */
  user_metadata: { role: AppRole; full_name: string };
};

type AuthCtx = {
  /** Non-null when the user is logged in (mirrors Supabase session shape). */
  session: AppUser | null;
  user: AppUser | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => void;
};

const SESSION_KEY = "mediagent_session";

const Ctx = createContext<AuthCtx>({
  session: null, user: null, role: null, loading: true,
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw) as AppUser);
    } catch {}
    setLoading(false);
  }, []);

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    window.location.href = "/auth";
  };

  return (
    <Ctx.Provider value={{ session: user, user, role: user?.role ?? null, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

/**
 * Persist a profile row as the current session.
 * Call this after a successful sign-in or sign-up.
 */
export function persistSession(profile: {
  id: string;
  email: string;
  full_name: string;
  role?: string | null;
}): AppUser {
  const role = (["patient", "doctor", "admin"].includes(profile.role ?? "")
    ? profile.role
    : "patient") as AppRole;

  const appUser: AppUser = {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    user_metadata: { role, full_name: profile.full_name },
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(appUser));
  return appUser;
}

export const roleHome = (r: AppRole | null) =>
  r === "doctor" ? "/doctor/dashboard"
  : r === "admin" ? "/admin/dashboard"
  : "/patient/dashboard";
