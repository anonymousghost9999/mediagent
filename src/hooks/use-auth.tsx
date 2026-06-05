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
  /** Call this after a successful sign-in/sign-up to update context + localStorage. */
  login: (profile: { id: string; email: string; full_name: string; role?: string | null }) => AppUser;
  signOut: () => void;
};

const SESSION_KEY = "mediagent_session";

const Ctx = createContext<AuthCtx>({
  session: null, user: null, role: null, loading: true,
  login: () => { throw new Error("AuthProvider not mounted"); },
  signOut: () => {},
});

function buildAppUser(profile: { id: string; email: string; full_name: string; role?: string | null }): AppUser {
  const role = (["patient", "doctor", "admin"].includes(profile.role ?? "")
    ? profile.role
    : "patient") as AppRole;
  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    user_metadata: { role, full_name: profile.full_name },
  };
}

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

  const login = (profile: { id: string; email: string; full_name: string; role?: string | null }): AppUser => {
    const appUser = buildAppUser(profile);
    localStorage.setItem(SESSION_KEY, JSON.stringify(appUser));
    setUser(appUser);   // <-- this is the key: update React state immediately
    return appUser;
  };

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    window.location.href = "/auth";
  };

  return (
    <Ctx.Provider value={{ session: user, user, role: user?.role ?? null, loading, login, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

/** Legacy helper kept for any call sites that used it directly. Now just a passthrough. */
export function persistSession(profile: { id: string; email: string; full_name: string; role?: string | null }): AppUser {
  return buildAppUser(profile);
}

export const roleHome = (r: AppRole | null) =>
  r === "doctor" ? "/doctor/dashboard"
  : r === "admin" ? "/admin/dashboard"
  : "/patient/dashboard";
