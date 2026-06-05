import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, roleHome } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "MediAgent — Agentic EHR" }] }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { session, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) navigate({ to: "/auth", replace: true });
    else if (role) navigate({ to: roleHome(role), replace: true });
  }, [session, role, loading, navigate]);

  return (
    <div className="min-h-[60vh] grid place-items-center text-muted-foreground">
      <div className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />Loading MediAgent…
      </div>
    </div>
  );
}
