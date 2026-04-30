import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners, useDroppable,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Plus, Users, Activity, KanbanSquare, Calendar, Trash2, Pencil } from "lucide-react";
import { format, formatDistanceToNow, parseISO, isPast, isToday } from "date-fns";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { MembersPanel } from "@/components/tasks/MembersPanel";
import { cn } from "@/lib/utils";

type Status = "todo" | "in_progress" | "done";
type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  position: number;
  updated_at: string;
}
interface Project { id: string; name: string; description: string | null; created_by: string; }
export interface Member { user_id: string; role: "owner" | "admin" | "member"; profile: { full_name: string | null; email: string; } | null }
interface Activity { id: string; action: string; user_id: string; created_at: string; entity_type: string | null; metadata: any; }

const COLUMNS: { id: Status; title: string; tone: string }[] = [
  { id: "todo", title: "To Do", tone: "bg-status-todo" },
  { id: "in_progress", title: "In Progress", tone: "bg-status-progress" },
  { id: "done", title: "Done", tone: "bg-status-done" },
];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [creatingFor, setCreatingFor] = useState<Status | null>(null);
  const [filter, setFilter] = useState<{ priority: Priority | "all"; assignee: string }>({ priority: "all", assignee: "all" });

  const myRole = members.find(m => m.user_id === user?.id)?.role;
  const isAdmin = myRole === "owner" || myRole === "admin";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: t }, { data: m }, { data: a }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase.from("tasks").select("*").eq("project_id", id).order("position", { ascending: true }),
      supabase.from("project_members").select("user_id,role,profile:profiles(full_name,email)").eq("project_id", id),
      supabase.from("activity_log").select("id,action,user_id,created_at,entity_type,metadata").eq("project_id", id).order("created_at", { ascending: false }).limit(30),
    ]);
    setProject(p as Project);
    setTasks((t as Task[]) || []);
    setMembers((m as any) || []);
    setActivity((a as Activity[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`project-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${id}` }, () => {
        supabase.from("tasks").select("*").eq("project_id", id).order("position", { ascending: true }).then(({ data }) => setTasks((data as Task[]) || []));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_log", filter: `project_id=eq.${id}` }, (payload) => {
        setActivity(prev => [payload.new as Activity, ...prev].slice(0, 30));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const memberMap = useMemo(() => {
    const m: Record<string, Member> = {};
    members.forEach(x => m[x.user_id] = x);
    return m;
  }, [members]);

  const filteredTasks = useMemo(() => tasks.filter(t =>
    (filter.priority === "all" || t.priority === filter.priority) &&
    (filter.assignee === "all" || t.assigned_to === filter.assignee)
  ), [tasks, filter]);

  const tasksByStatus = (s: Status) => filteredTasks.filter(t => t.status === s);

  const logActivity = async (action: string, entity_id?: string, metadata?: any) => {
    if (!id || !user) return;
    await supabase.from("activity_log").insert({ project_id: id, user_id: user.id, action, entity_type: "task", entity_id, metadata });
  };

  const handleDragStart = (e: DragStartEvent) => {
    const t = tasks.find(x => x.id === e.active.id); if (t) setActiveTask(t);
  };
  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = active.id as string;
    const newStatus = over.id as Status;
    const t = tasks.find(x => x.id === taskId);
    if (!t || t.status === newStatus) return;
    // Optimistic
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status: newStatus } : x));
    const { error } = await supabase.from("tasks").update({ status: newStatus }).eq("id", taskId);
    if (error) {
      toast.error("Failed to move task");
      setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status: t.status } : x));
    } else {
      logActivity(`moved task to ${newStatus.replace("_", " ")}`, taskId, { title: t.title, from: t.status, to: newStatus });
    }
  };

  if (loading) return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-3">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-96" />)}</div>
    </div>
  );

  if (!project) return (
    <div className="mx-auto max-w-3xl text-center py-20">
      <h2 className="text-xl font-semibold">Project not found</h2>
      <Link to="/projects" className="mt-4 inline-flex items-center text-primary"><ArrowLeft className="mr-2 h-4 w-4" />Back to projects</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link to="/projects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1.5 h-4 w-4" /> Projects</Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {project.description && <p className="mt-1 text-muted-foreground">{project.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map(m => (
                <Avatar key={m.user_id} className="h-8 w-8 border-2 border-background">
                  <AvatarFallback className="bg-secondary text-xs">{(m.profile?.full_name || m.profile?.email || "?").slice(0,2).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
              {members.length > 5 && <div className="grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-muted text-xs">+{members.length - 5}</div>}
            </div>
            {isAdmin && (
              <Button onClick={() => setCreatingFor("todo")} className="bg-gradient-primary shadow-glow"><Plus className="mr-2 h-4 w-4" /> New task</Button>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="board">
        <TabsList className="bg-card">
          <TabsTrigger value="board"><KanbanSquare className="mr-2 h-4 w-4" />Board</TabsTrigger>
          <TabsTrigger value="members"><Users className="mr-2 h-4 w-4" />Members</TabsTrigger>
          <TabsTrigger value="activity"><Activity className="mr-2 h-4 w-4" />Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <FilterChip active={filter.priority==="all"} onClick={()=>setFilter(f=>({...f,priority:"all"}))}>All priorities</FilterChip>
            {(["high","medium","low"] as Priority[]).map(p =>
              <FilterChip key={p} active={filter.priority===p} onClick={()=>setFilter(f=>({...f,priority:p}))}>
                <span className={cn("mr-1.5 h-2 w-2 rounded-full inline-block", p==="high"&&"bg-priority-high", p==="medium"&&"bg-priority-medium", p==="low"&&"bg-priority-low")} />
                {p}
              </FilterChip>
            )}
            <div className="mx-2 h-6 w-px bg-border" />
            <FilterChip active={filter.assignee==="all"} onClick={()=>setFilter(f=>({...f,assignee:"all"}))}>Everyone</FilterChip>
            {user && <FilterChip active={filter.assignee===user.id} onClick={()=>setFilter(f=>({...f,assignee:user.id}))}>Just me</FilterChip>}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid gap-4 md:grid-cols-3">
              {COLUMNS.map(col => (
                <Column
                  key={col.id}
                  status={col.id}
                  title={col.title}
                  tone={col.tone}
                  tasks={tasksByStatus(col.id)}
                  memberMap={memberMap}
                  onAdd={isAdmin ? () => setCreatingFor(col.id) : undefined}
                  onEdit={(t) => setEditingTask(t)}
                  isAdmin={!!isAdmin}
                  currentUserId={user?.id}
                  onDelete={async (t) => {
                    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
                    if (error) return toast.error(error.message);
                    toast.success("Task deleted");
                    logActivity("deleted task", t.id, { title: t.title });
                  }}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask && <div className="rotate-2"><TaskCardView task={activeTask} memberMap={memberMap} dragging /></div>}
            </DragOverlay>
          </DndContext>
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MembersPanel projectId={project.id} members={members} isAdmin={!!isAdmin} onChanged={load} currentUserId={user?.id || ""} />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card className="glass rounded-2xl border-0 p-6 shadow-md">
            {activity.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-3">
                <AnimatePresence initial={false}>
                  {activity.map(a => {
                    const m = memberMap[a.user_id];
                    const name = m?.profile?.full_name || m?.profile?.email || "Someone";
                    return (
                      <motion.li key={a.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3">
                        <Avatar className="h-8 w-8"><AvatarFallback className="bg-gradient-primary text-xs text-primary-foreground">{name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm"><span className="font-medium">{name}</span> <span className="text-muted-foreground">{a.action}</span>{a.metadata?.title && <span className="font-medium"> — {a.metadata.title}</span>}</p>
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(a.created_at), { addSuffix: true })}</p>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <TaskDialog
        open={creatingFor !== null || editingTask !== null}
        onOpenChange={(o) => { if (!o) { setCreatingFor(null); setEditingTask(null); } }}
        projectId={project.id}
        members={members}
        editing={editingTask}
        defaultStatus={creatingFor || "todo"}
        onSaved={(t, isNew) => {
          logActivity(isNew ? "created task" : "updated task", t.id, { title: t.title });
        }}
      />
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn(
      "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition",
      active ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
    )}>{children}</button>
  );
}

function Column({ status, title, tone, tasks, memberMap, onAdd, onEdit, onDelete, isAdmin, currentUserId }: {
  status: Status; title: string; tone: string; tasks: Task[]; memberMap: Record<string, Member>;
  onAdd?: () => void; onEdit: (t: Task) => void; onDelete: (t: Task) => void; isAdmin: boolean; currentUserId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cn("flex flex-col rounded-2xl border border-border/60 bg-card/50 p-3 transition", isOver && "border-primary/40 bg-primary/5")}>
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", tone)} />
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{tasks.length}</span>
        </div>
        {onAdd && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAdd}><Plus className="h-4 w-4" /></Button>}
      </div>
      <div className="flex-1 space-y-2 min-h-32">
        <AnimatePresence initial={false}>
          {tasks.map(t => {
            const canEdit = isAdmin || t.assigned_to === currentUserId;
            return (
              <DraggableTask key={t.id} task={t}>
                <TaskCardView
                  task={t}
                  memberMap={memberMap}
                  onClick={canEdit ? () => onEdit(t) : undefined}
                  onDelete={isAdmin ? () => onDelete(t) : undefined}
                />
              </DraggableTask>
            );
          })}
        </AnimatePresence>
        {tasks.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableTask({ task, children }: { task: Task; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && "opacity-30")}>
      {children}
    </div>
  );
}

function TaskCardView({ task, memberMap, onClick, onDelete, dragging }: { task: Task; memberMap: Record<string, Member>; onClick?: () => void; onDelete?: () => void; dragging?: boolean }) {
  const assignee = task.assigned_to ? memberMap[task.assigned_to] : null;
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due && isPast(due) && !isToday(due) && task.status !== "done";
  const todayDue = due && isToday(due);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={cn(
        "group rounded-xl border border-border/70 bg-card p-3 shadow-sm transition hover:border-primary/30 hover:shadow-md",
        dragging && "shadow-lg ring-2 ring-primary/30"
      )}
    >
      <div className="flex items-start gap-2">
        <button onClick={onClick} className="flex-1 text-left">
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full",
              task.priority === "high" && "bg-priority-high",
              task.priority === "medium" && "bg-priority-medium",
              task.priority === "low" && "bg-priority-low"
            )} />
            <p className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</p>
          </div>
          {task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}
        </button>
        {onClick && <Pencil className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-50" />}
        {onDelete && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {due && (
            <Badge variant="secondary" className={cn(
              "h-5 gap-1 rounded-md px-1.5 text-[10px]",
              overdue ? "bg-destructive/10 text-destructive" : todayDue ? "bg-warning/15 text-warning-foreground" : "bg-muted text-muted-foreground"
            )}>
              <Calendar className="h-2.5 w-2.5" /> {format(due, "MMM d")}
            </Badge>
          )}
        </div>
        {assignee ? (
          <Avatar className="h-6 w-6"><AvatarFallback className="bg-secondary text-[10px]">{(assignee.profile?.full_name || assignee.profile?.email || "?").slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
        ) : <span className="text-[10px] text-muted-foreground">Unassigned</span>}
      </div>
    </motion.div>
  );
}
