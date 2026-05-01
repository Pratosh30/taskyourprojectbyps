import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, FolderKanban, LogOut, Sparkles, Menu, ShieldCheck, ListTodo } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";
import CommandPalette from "@/components/CommandPalette";

const baseNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/my-tasks", label: "My tasks", icon: ListTodo, end: false },
];

function NavList({ onNav, isAdmin }: { onNav?: () => void; isAdmin?: boolean }) {
  const nav = isAdmin
    ? [...baseNav, { to: "/team", label: "Team", icon: ShieldCheck, end: false }]
    : baseNav;
  return (
    <nav className="flex flex-col gap-1 px-3">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNav}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarBrand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
        <Sparkles className="h-5 w-5 text-primary-foreground" />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight text-sidebar-foreground">Pulse</p>
        <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Team Tasks</p>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) setProfileName(data.full_name || data.email);
    });
  }, [user]);

  const initials = (profileName || user?.email || "U").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="flex min-h-screen w-full bg-background mesh-bg">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarBrand />
        <div className="mt-2 flex-1 overflow-y-auto">
          <p className="px-6 pb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Workspace</p>
          <NavList isAdmin={isAdmin} />
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar className="h-8 w-8"><AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{initials}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">{profileName || user?.email}</p>
              <p className="truncate text-xs text-sidebar-foreground/50">{user?.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
              <SidebarBrand />
              <NavList isAdmin={isAdmin} />
            </SheetContent>
          </Sheet>
          <CommandPalette />
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <Avatar className="h-8 w-8 lg:hidden"><AvatarFallback className="bg-gradient-primary text-xs text-primary-foreground">{initials}</AvatarFallback></Avatar>
          </div>
        </header>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex-1 overflow-y-auto p-4 md:p-8"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}
