import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, createRootRouteWithContext, useRouter, useRouterState, useNavigate,
  HeadContent, Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/mediagent/app-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Screen not found in MediAgent.</p>
        <a href="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Go home</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Try again</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MediAgent — Agentic EHR" },
      { name: "description", content: "Doctor-in-the-loop EHR & hospital workflow platform." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppFrame />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function AppFrame() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { session, role, loading, user, signOut } = useAuth();
  const isAuthRoute = pathname === "/auth";

  // Guard: any non-auth, non-root route requires a session.
  useEffect(() => {
    if (loading || isAuthRoute || pathname === "/") return;
    if (!session) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!role) return;
    const allowedPrefix =
      role === "patient" ? "/patient" : role === "doctor" ? "/doctor" : "/admin";
    if (!pathname.startsWith(allowedPrefix)) {
      navigate({
        to: role === "patient" ? "/patient/dashboard"
          : role === "doctor" ? "/doctor/dashboard"
          : "/admin/dashboard",
        replace: true,
      });
    }
  }, [loading, session, role, isAuthRoute, pathname, navigate]);

  if (isAuthRoute) return <Outlet />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {session && <AppSidebar role={role} />}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border/60 bg-background/80 px-4 sticky top-0 z-10 backdrop-blur-xl">
            {session && <SidebarTrigger />}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-accent/40 pulse-dot" />
                <span className="relative rounded-full h-2 w-2 bg-accent" />
              </span>
              <span className="text-xs text-muted-foreground">AI assistant <span className="text-foreground/70">active</span></span>
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              {session ? (
                <>
                  {role && <span className="chip bg-accent-soft text-accent uppercase tracking-wider font-mono text-[10px]">{role}</span>}
                  <span className="hidden sm:inline">{user?.email}</span>
                  <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/auth", replace: true }); }}>
                    <LogOut className="h-3.5 w-3.5 mr-1.5" />Sign out
                  </Button>
                </>
              ) : (
                <span className="chip bg-muted">Not signed in</span>
              )}
            </div>
          </header>
          <main className="flex-1 min-w-0"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
