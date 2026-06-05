import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, Calendar, ClipboardList, FileText, History,
  LayoutDashboard, ListChecks, Pill, Shield, Stethoscope,
  Users, UserCog, FlaskConical, Settings, ScrollText, MessageSquarePlus,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }> };

const patientItems: Item[] = [
  { title: "Dashboard", url: "/patient/dashboard", icon: LayoutDashboard },
  { title: "New Consultation", url: "/patient/consultation/new", icon: MessageSquarePlus },
  { title: "Ongoing Treatments", url: "/patient/treatments/ongoing", icon: Activity },
  { title: "Treatment History", url: "/patient/treatments/history", icon: History },
  { title: "Medical Timeline", url: "/patient/timeline", icon: ClipboardList },
  { title: "Reports", url: "/patient/reports", icon: FileText },
  { title: "Prescriptions", url: "/patient/prescriptions", icon: Pill },
  { title: "Profile", url: "/patient/profile", icon: UserCog },
];

const doctorItems: Item[] = [
  { title: "Dashboard", url: "/doctor/dashboard", icon: LayoutDashboard },
  { title: "Severity Queue", url: "/doctor/queue", icon: ListChecks },
  { title: "Patients", url: "/doctor/patients", icon: Users },
  { title: "Pending Reviews", url: "/doctor/reviews", icon: ScrollText },
  { title: "Appointments", url: "/doctor/appointments", icon: Calendar },
];

const adminItems: Item[] = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Users", url: "/admin/users", icon: Users },
  { title: "Doctors", url: "/admin/doctors", icon: Stethoscope },
  { title: "Permissions", url: "/admin/permissions", icon: Shield },
  { title: "AI Models", url: "/admin/ai-models", icon: FlaskConical },
  { title: "Audit Logs", url: "/admin/audit-logs", icon: ScrollText },
  { title: "Hospital Settings", url: "/admin/hospital-settings", icon: Settings },
];

export function AppSidebar({ role }: { role?: "patient" | "doctor" | "admin" | null }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");

  const section = (label: string, items: Item[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">M</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-sidebar-foreground">MediAgent</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">Doctor-in-the-loop EHR</div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {role === "patient" && section("Patient", patientItems)}
        {role === "doctor" && section("Doctor", doctorItems)}
        {role === "admin" && section("Admin", adminItems)}
      </SidebarContent>
      <SidebarFooter className="px-4 py-3 text-[10px] text-sidebar-foreground/50">
        v1.0 · {role ?? "guest"}
      </SidebarFooter>
    </Sidebar>
  );
}
