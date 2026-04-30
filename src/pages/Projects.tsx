import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, FolderKanban, Users, Loader2 } from "lucide-react";
import { z } from "zod";

interface ProjectRow { id: string; name: string; description: string | null; created_at: string; }

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

export default function Projects() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; done: number; members: number }>>({});
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: pData } = await supabase.from("projects").select("id,name,description,created_at").order("created_at", { ascending: false });
    const projs = (pData as ProjectRow[]) || [];
    setProjects(projs);
    if (projs.length) {
      const ids = projs.map(p => p.id);
      const [{ data: tData }, { data: mData }] = await Promise.all([
        supabase.from("tasks").select("project_id,status").in("project_id", ids),
        supabase.from("project_members").select("project_id").in("project_id", ids),
      ]);
      const c: Record<string, { total: number; done: number; members: number }> = {};
      projs.forEach(p => c[p.id] = { total: 0, done: 0, members: 0 });
      (tData || []).forEach((t: any) => { c[t.project_id].total++; if (t.status === "done") c[t.project_id].done++; });
      (mData || []).forEach((m: any) => { c[m.project_id].members++; });
      setCounts(c);
    }
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const create = async () => {
    const parsed = schema.safeParse({ name, description });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    if (!user) return;
    setBusy(true);
    const { data, error } = await supabase.from("projects").insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: user.id,
    }).select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Project created");
    setOpen(false); setName(""); setDescription("");
    if (data) {
      // log activity
      await supabase.from("activity_log").insert({
        project_id: data.id, user_id: user.id, action: "created project", entity_type: "project", entity_id: data.id,
      });
    }
    load();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-muted-foreground">Organize work into focused, collaborative spaces.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary shadow-glow hover:opacity-95">
              <Plus className="mr-2 h-4 w-4" /> New project
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader><DialogTitle>Create a new project</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="pname">Name</Label>
                <Input id="pname" value={name} onChange={e => setName(e.target.value)} placeholder="Q3 Launch" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pdesc">Description</Label>
                <Textarea id="pdesc" value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this project about?" rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={busy} className="bg-gradient-primary">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <Card className="glass rounded-2xl border-0 p-12 text-center shadow-md">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
            <FolderKanban className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No projects yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first project to start orchestrating tasks.</p>
          <Button onClick={() => setOpen(true)} className="mt-5 bg-gradient-primary shadow-glow"><Plus className="mr-2 h-4 w-4" /> New project</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, idx) => {
            const c = counts[p.id] || { total: 0, done: 0, members: 0 };
            const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}>
                <Link to={`/projects/${p.id}`} className="group block">
                  <Card className="glass h-full rounded-2xl border-0 p-5 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg">
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-sm"><FolderKanban className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{p.name}</h3>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{p.description || "No description"}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{c.total} tasks</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {c.members}</span>
                      <span className="font-medium text-foreground">{pct}%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-gradient-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
