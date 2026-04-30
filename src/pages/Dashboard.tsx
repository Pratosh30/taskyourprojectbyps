import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, AlertTriangle, FolderKanban, ArrowRight, TrendingUp } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

interface TaskRow {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  project_id: string;
  updated_at: string;
}
interface ProjectRow { id: string; name: string; }

export default function Dashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [t, p] = await Promise.all([
        supabase.from("tasks").select("id,title,status,priority,due_date,project_id,updated_at").order("updated_at", { ascending: false }),
        supabase.from("projects").select("id,name").order("created_at", { ascending: false }),
      ]);
      setTasks((t.data as TaskRow[]) || []);
      setProjects((p.data as ProjectRow[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const today = tasks.filter(t => t.due_date && isToday(parseISO(t.due_date)) && t.status !== "done");
  const overdue = tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== "done");
  const myAssigned = tasks.filter(t => t.status !== "done");
  const completed = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const completion = total ? Math.round((completed / total) * 100) : 0;

  // Build last 7 days completion chart (by updated_at when done)
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = format(d, "MMM d");
    const count = tasks.filter(t => t.status === "done" && format(parseISO(t.updated_at), "MMM d") === key).length;
    return { day: key, completed: count };
  });

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || "—";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Your team's pulse — at a glance.</p>
      </motion.div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard loading={loading} label="Due today" value={today.length} icon={<Clock className="h-4 w-4" />} tone="accent" />
        <StatCard loading={loading} label="Overdue" value={overdue.length} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" />
        <StatCard loading={loading} label="Open tasks" value={myAssigned.length} icon={<TrendingUp className="h-4 w-4" />} tone="primary" />
        <StatCard loading={loading} label="Completion" value={`${completion}%`} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart */}
        <Card className="glass col-span-2 rounded-2xl border-0 p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Productivity (last 7 days)</h3>
              <p className="text-xs text-muted-foreground">Tasks completed across all projects</p>
            </div>
          </div>
          <div className="h-64">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="hsl(var(--primary-glow))" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                    cursor={{ fill: "hsl(var(--muted))" }}
                  />
                  <Bar dataKey="completed" fill="url(#barGrad)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Overdue list */}
        <Card className="glass rounded-2xl border-0 p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Needs attention</h3>
            <Badge variant="secondary" className="bg-destructive/10 text-destructive">{overdue.length}</Badge>
          </div>
          <div className="space-y-2">
            {loading ? Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-14 w-full" />) :
              overdue.length === 0 ? (
                <EmptyMini text="Nothing overdue. 🎉" />
              ) : overdue.slice(0, 5).map(t => (
                <Link to={`/projects/${t.project_id}`} key={t.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 transition hover:border-destructive/40 hover:shadow-sm">
                  <div className="h-2 w-2 rounded-full bg-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{projectName(t.project_id)} · {format(parseISO(t.due_date!), "MMM d")}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))
            }
          </div>
        </Card>
      </div>

      {/* Projects strip */}
      <Card className="glass rounded-2xl border-0 p-6 shadow-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Your projects</h3>
          <Link to="/projects" className="text-sm font-medium text-primary hover:underline">View all</Link>
        </div>
        {loading ? <div className="grid gap-3 md:grid-cols-3">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-24" />)}</div> :
          projects.length === 0 ? (
            <EmptyMini text="No projects yet — create one to start collaborating." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {projects.slice(0, 6).map(p => {
                const ts = tasks.filter(t => t.project_id === p.id);
                const done = ts.filter(t => t.status === "done").length;
                const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className="group rounded-xl border border-border/60 bg-card p-4 transition hover:border-primary/40 hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-primary text-primary-foreground"><FolderKanban className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{ts.length} tasks · {pct}% done</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-gradient-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        }
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon, tone, loading }: { label: string; value: number | string; icon: React.ReactNode; tone: "primary"|"accent"|"destructive"|"success"; loading: boolean }) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/10 text-accent",
    destructive: "bg-destructive/10 text-destructive",
    success: "bg-success/10 text-success",
  } as const;
  return (
    <Card className="glass rounded-2xl border-0 p-5 shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${toneMap[tone]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">
        {loading ? <Skeleton className="h-8 w-16" /> : value}
      </p>
    </Card>
  );
}

function EmptyMini({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">{text}</p>;
}
