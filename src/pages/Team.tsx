import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Users, History, Crown, Shield, Search, UserPlus, X, FolderKanban, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";

type AppRole = "admin" | "member";
type ProjectRole = "owner" | "admin" | "member";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  appRole: AppRole;
}
interface ProjectRow { id: string; name: string; description: string | null; created_at: string; }
interface MemberRow { user_id: string; role: ProjectRole; profile: { full_name: string | null; email: string } | null }
interface AuditRow {
  id: string; action: string; created_at: string; user_id: string;
  project_id: string; entity_type: string | null; metadata: any;
}

export default function Team() {
  const { isAdmin, loading: roleLoading } = useIsAdmin();

  if (roleLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin only
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Team management</h1>
          <p className="mt-1 text-muted-foreground">Manage app roles, project membership, and review audit history.</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-card">
          <TabsTrigger value="users"><Users className="mr-2 h-4 w-4" />Members</TabsTrigger>
          <TabsTrigger value="projects"><FolderKanban className="mr-2 h-4 w-4" />Project membership</TabsTrigger>
          <TabsTrigger value="audit"><History className="mr-2 h-4 w-4" />Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4"><UsersTab /></TabsContent>
        <TabsContent value="projects" className="mt-4"><ProjectsTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditTab /></TabsContent>
      </Tabs>
    </motion.div>
  );
}

/* ───────────────────────── Members tab ───────────────────────── */

function UsersTab() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const adminSet = new Set((roles || []).filter(r => r.role === "admin").map(r => r.user_id));
    setUsers((profiles || []).map(p => ({
      id: p.id, email: p.email, full_name: p.full_name, created_at: p.created_at,
      appRole: adminSet.has(p.id) ? "admin" : "member",
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setRole = async (u: UserRow, role: AppRole) => {
    if (u.id === user?.id && u.appRole === "admin" && role === "member") {
      // Prevent removing your own admin role if you'd be the last admin
      const otherAdmins = users.filter(x => x.appRole === "admin" && x.id !== u.id).length;
      if (otherAdmins === 0) return toast.error("You're the last admin — promote someone else first.");
    }
    if (role === "admin") {
      const { error } = await supabase.from("user_roles").insert({ user_id: u.id, role: "admin" });
      if (error && error.code !== "23505") return toast.error(error.message);
      toast.success(`${u.full_name || u.email} is now an admin`);
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", u.id).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success(`Revoked admin from ${u.full_name || u.email}`);
    }
    load();
  };

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return users;
    return users.filter(u => (u.full_name || "").toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [users, q]);

  const adminCount = users.filter(u => u.appRole === "admin").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total members" value={users.length} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Admins" value={adminCount} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Members" value={users.length - adminCount} icon={<Shield className="h-4 w-4" />} />
      </div>

      <Card className="glass rounded-2xl border-0 p-0 shadow-md overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or email…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60" />
        </div>

        {loading ? (
          <div className="p-6 space-y-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(u => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarFallback className="bg-gradient-primary text-xs text-primary-foreground">
                        {(u.full_name || u.email).slice(0,2).toUpperCase()}
                      </AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{u.full_name || u.email.split("@")[0]}{u.id===user?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDistanceToNow(parseISO(u.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.appRole === "admin" ? "default" : "secondary"} className="capitalize">
                      {u.appRole === "admin" && <ShieldCheck className="mr-1 h-3 w-3" />}
                      {u.appRole}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {u.appRole === "admin" ? (
                      <Button variant="ghost" size="sm" onClick={() => setRole(u, "member")}>
                        <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> Revoke admin
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setRole(u, "admin")}>
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Promote
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No users found.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ──────────────────── Project membership tab ──────────────────── */

function ProjectsTab() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [memLoading, setMemLoading] = useState(false);
  const [inviteId, setInviteId] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("member");

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: u }] = await Promise.all([
        supabase.from("projects").select("id,name,description,created_at").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,email,full_name").order("email"),
      ]);
      setProjects(p || []);
      setAllUsers(u || []);
      if (p && p.length) setSelected(p[0].id);
      setLoading(false);
    })();
  }, []);

  const loadMembers = async (projectId: string) => {
    setMemLoading(true);
    const { data } = await supabase
      .from("project_members")
      .select("user_id,role,profile:profiles(full_name,email)")
      .eq("project_id", projectId);
    setMembers((data as any) || []);
    setMemLoading(false);
  };

  useEffect(() => { if (selected) loadMembers(selected); }, [selected]);

  const memberIds = new Set(members.map(m => m.user_id));
  const candidates = allUsers.filter(u => !memberIds.has(u.id));

  const addMember = async () => {
    if (!selected || !inviteId) return;
    const { error } = await supabase.from("project_members").insert({ project_id: selected, user_id: inviteId, role: inviteRole });
    if (error) {
      if (error.code === "23505") toast.error("Already a member");
      else toast.error(error.message);
      return;
    }
    toast.success("Member added");
    setInviteId("");
    setInviteRole("member");
    loadMembers(selected);
  };

  const updateRole = async (m: MemberRow, role: ProjectRole) => {
    if (!selected) return;
    const { error } = await supabase.from("project_members").update({ role }).eq("project_id", selected).eq("user_id", m.user_id);
    if (error) return toast.error(error.message);
    toast.success("Role updated");
    loadMembers(selected);
  };

  const remove = async (m: MemberRow) => {
    if (!selected) return;
    const { error } = await supabase.from("project_members").delete().eq("project_id", selected).eq("user_id", m.user_id);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    loadMembers(selected);
  };

  if (loading) return <Skeleton className="h-96" />;

  if (projects.length === 0) {
    return <Card className="glass rounded-2xl border-0 p-12 text-center shadow-md">
      <FolderKanban className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">No projects yet.</p>
    </Card>;
  }

  const current = projects.find(p => p.id === selected);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="glass rounded-2xl border-0 p-3 shadow-md h-fit">
        <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Projects</p>
        <ul className="space-y-1">
          {projects.map(p => (
            <li key={p.id}>
              <button
                onClick={() => setSelected(p.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${selected===p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60"}`}
              >
                <p className="truncate">{p.name}</p>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-4">
        {current && (
          <Card className="glass rounded-2xl border-0 p-6 shadow-md">
            <h3 className="font-semibold">{current.name}</h3>
            {current.description && <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>}
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
              <Select value={inviteId} onValueChange={setInviteId}>
                <SelectTrigger><SelectValue placeholder="Choose user to add…" /></SelectTrigger>
                <SelectContent>
                  {candidates.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">All users already in project</div>}
                  {candidates.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email} <span className="text-muted-foreground">— {u.email}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as ProjectRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addMember} disabled={!inviteId} className="bg-gradient-primary"><UserPlus className="mr-2 h-4 w-4" />Add</Button>
            </div>
          </Card>
        )}

        <Card className="glass rounded-2xl border-0 p-0 shadow-md overflow-hidden">
          <div className="border-b border-border/60 px-4 py-3 text-sm font-medium">Members ({members.length})</div>
          {memLoading ? (
            <div className="p-6 space-y-2">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-40">Role</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map(m => {
                  const name = m.profile?.full_name || m.profile?.email || "Unknown";
                  return (
                    <TableRow key={m.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8"><AvatarFallback className="bg-secondary text-xs">{name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{name}</p>
                            <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {m.role === "owner" ? (
                          <Badge variant="secondary" className="capitalize"><Crown className="mr-1 h-3 w-3" />Owner</Badge>
                        ) : (
                          <Select value={m.role} onValueChange={(v) => updateRole(m, v as ProjectRole)}>
                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.role !== "owner" && (
                          <Button variant="ghost" size="icon" onClick={() => remove(m)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {members.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No members yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ──────────────────────── Audit log tab ──────────────────────── */

function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string }>>({});
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const [{ data: a }, { data: p }, { data: pr }] = await Promise.all([
      supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,full_name,email"),
      supabase.from("projects").select("id,name"),
    ]);
    setRows((a as AuditRow[]) || []);
    const pm: Record<string, any> = {}; (p || []).forEach(x => pm[x.id] = x); setProfiles(pm);
    const prm: Record<string, string> = {}; (pr || []).forEach(x => prm[x.id] = x.name); setProjects(prm);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime new entries
  useEffect(() => {
    const ch = supabase
      .channel("admin-audit")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log" }, (payload) => {
        setRows(prev => [payload.new as AuditRow, ...prev].slice(0, 200));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = projectFilter === "all" ? rows : rows.filter(r => r.project_id === projectFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {Object.entries(projects).map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{filtered.length} entries</p>
      </div>

      <Card className="glass rounded-2xl border-0 p-4 shadow-md">
        {loading ? (
          <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-14" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {filtered.map(r => {
                const u = profiles[r.user_id];
                const name = u?.full_name || u?.email || "Unknown user";
                const projectName = projects[r.project_id] || "Unknown project";
                return (
                  <motion.li key={r.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3"
                  >
                    <Avatar className="h-8 w-8"><AvatarFallback className="bg-gradient-primary text-xs text-primary-foreground">{name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{name}</span>{" "}
                        <span className="text-muted-foreground">{r.action}</span>
                        {r.metadata?.title && <span className="font-medium"> — {r.metadata.title}</span>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-normal">{projectName}</Badge>
                        <span>{formatDistanceToNow(parseISO(r.created_at), { addSuffix: true })}</span>
                      </p>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ───────────── small bits ───────────── */

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="glass rounded-2xl border-0 p-5 shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}
