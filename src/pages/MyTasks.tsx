import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListTodo, AlertTriangle, Clock, CheckCircle2, ArrowRight } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";

interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  project_id: string;
  updated_at: string;
}

const PRIORITY_TONE: Record<Task["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-accent/15 text-accent",
  high: "bg-destructive/15 text-destructive",
};

export default function MyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "todo" | "in_progress" | "done">("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [t, p] = await Promise.all([
        supabase.from("tasks").select("id,title,status,priority,due_date,project_id,updated_at")
          .eq("assigned_to", user.id).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("projects").select("id,name"),
      ]);
      setTasks((t.data as Task[]) || []);
      const map: Record<string, string> = {};
      (p.data || []).forEach((x) => { map[x.id] = x.name; });
      setProjects(map);
      setLoading(false);
    })();
  }, [user]);

  const counts = useMemo(() => ({
    all: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    overdue: tasks.filter((t) => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== "done").length,
    today: tasks.filter((t) => t.due_date && isToday(parseISO(t.due_date)) && t.status !== "done").length,
  }), [tasks]);

  const visible = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My tasks</h1>
        <p className="mt-1 text-muted-foreground">Everything assigned to you across all projects.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Assigned to me" value={counts.all} icon={<ListTodo className="h-4 w-4" />} />
        <Stat label="Due today" value={counts.today} icon={<Clock className="h-4 w-4" />} tone="accent" />
        <Stat label="Overdue" value={counts.overdue} icon={<AlertTriangle className="h-4 w-4" />} tone="destructive" />
        <Stat label="Completed" value={counts.done} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
        <TabsList className="bg-card">
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="todo">To do ({counts.todo})</TabsTrigger>
          <TabsTrigger value="in_progress">In progress ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="done">Done ({counts.done})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="glass rounded-2xl border-0 p-2 shadow-md">
        {loading ? (
          <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : visible.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">Nothing here. Enjoy the silence. 🌿</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((t) => {
              const overdue = t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== "done";
              const due = t.due_date ? parseISO(t.due_date) : null;
              return (
                <li key={t.id}>
                  <Link to={`/projects/${t.project_id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-muted/40">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${
                      t.status === "done" ? "bg-success" : t.status === "in_progress" ? "bg-accent" : "bg-muted-foreground/40"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{projects[t.project_id] || "Project"}</p>
                    </div>
                    <Badge variant="secondary" className={`hidden sm:inline-flex ${PRIORITY_TONE[t.priority]}`}>{t.priority}</Badge>
                    {due && (
                      <span className={`hidden text-xs sm:inline ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {format(due, "MMM d")}
                      </span>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </motion.div>
  );
}

function Stat({ label, value, icon, tone = "primary" }: { label: string; value: number; icon: React.ReactNode; tone?: "primary" | "accent" | "destructive" | "success" }) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    accent: "bg-accent/15 text-accent",
    destructive: "bg-destructive/15 text-destructive",
    success: "bg-success/15 text-success",
  } as const;
  return (
    <Card className="glass rounded-2xl border-0 p-5 shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tone]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
