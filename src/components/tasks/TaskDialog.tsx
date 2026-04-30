import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Task, Member } from "@/pages/ProjectDetail";

const schema = z.object({
  title: z.string().trim().min(1, "Title required").max(120),
  description: z.string().trim().max(1000).optional(),
  priority: z.enum(["low", "medium", "high"]),
  status: z.enum(["todo", "in_progress", "done"]),
  due_date: z.string().optional(),
  assigned_to: z.string().nullable().optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  members: Member[];
  editing: Task | null;
  defaultStatus: "todo" | "in_progress" | "done";
  onSaved: (t: Task, isNew: boolean) => void;
}

export function TaskDialog({ open, onOpenChange, projectId, members, editing, defaultStatus, onSaved }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low"|"medium"|"high">("medium");
  const [status, setStatus] = useState<"todo"|"in_progress"|"done">(defaultStatus);
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>("unassigned");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description || "");
      setPriority(editing.priority);
      setStatus(editing.status);
      setDueDate(editing.due_date ? editing.due_date.split("T")[0] : "");
      setAssignee(editing.assigned_to || "unassigned");
    } else {
      setTitle(""); setDescription(""); setPriority("medium"); setStatus(defaultStatus); setDueDate(""); setAssignee("unassigned");
    }
  }, [open, editing, defaultStatus]);

  const save = async () => {
    const parsed = schema.safeParse({
      title, description, priority, status,
      due_date: dueDate || undefined,
      assigned_to: assignee === "unassigned" ? null : assignee,
    });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    if (!user) return;
    setBusy(true);
    const payload = {
      title: parsed.data.title,
      description: parsed.data.description || null,
      priority: parsed.data.priority,
      status: parsed.data.status,
      due_date: parsed.data.due_date ? new Date(parsed.data.due_date).toISOString() : null,
      assigned_to: parsed.data.assigned_to || null,
    };
    if (editing) {
      const { data, error } = await supabase.from("tasks").update(payload).eq("id", editing.id).select().single();
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Task updated");
      onSaved(data as Task, false);
    } else {
      const { data, error } = await supabase.from("tasks").insert({ ...payload, project_id: projectId, created_by: user.id }).select().single();
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Task created");
      onSaved(data as Task, true);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader><DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ship onboarding redesign" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" value={description} onChange={e=>setDescription(e.target.value)} rows={3} placeholder="Optional details..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">Due date</Label>
              <Input id="t-due" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {members.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.full_name || m.profile?.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-gradient-primary">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
