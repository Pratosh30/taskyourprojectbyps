import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FolderKanban, ListTodo, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

type Item =
  | { kind: "project"; id: string; title: string; sub?: string }
  | { kind: "task"; id: string; title: string; sub?: string; project_id: string }
  | { kind: "user"; id: string; title: string; sub?: string };

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [p, t, u] = await Promise.all([
        supabase.from("projects").select("id,name,description").order("created_at", { ascending: false }).limit(20),
        supabase.from("tasks").select("id,title,project_id,status").order("updated_at", { ascending: false }).limit(50),
        supabase.from("profiles").select("id,full_name,email").limit(50),
      ]);
      const combined: Item[] = [
        ...((p.data || []).map((x) => ({ kind: "project", id: x.id, title: x.name, sub: x.description || "Project" })) as Item[]),
        ...((t.data || []).map((x: any) => ({ kind: "task", id: x.id, title: x.title, sub: `Task · ${x.status}`, project_id: x.project_id })) as Item[]),
        ...((u.data || []).map((x) => ({ kind: "user", id: x.id, title: x.full_name || x.email, sub: x.email })) as Item[]),
      ];
      setItems(combined);
    })();
  }, [open]);

  const onPick = (item: Item) => {
    setOpen(false);
    if (item.kind === "project") navigate(`/projects/${item.id}`);
    else if (item.kind === "task") navigate(`/projects/${item.project_id}`);
    else if (item.kind === "user") navigate(`/team`);
  };

  const projects = items.filter((i) => i.kind === "project");
  const tasks = items.filter((i) => i.kind === "task");
  const users = items.filter((i) => i.kind === "user");

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-72 justify-between border-border/60 bg-card text-muted-foreground hover:text-foreground md:inline-flex"
      >
        <span className="flex items-center gap-2 text-sm">
          <Search className="h-4 w-4" />
          Search projects, tasks…
        </span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search projects, tasks, members…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {projects.length > 0 && (
            <CommandGroup heading="Projects">
              {projects.map((i) => (
                <CommandItem key={i.id} onSelect={() => onPick(i)} value={`project ${i.title}`}>
                  <FolderKanban className="mr-2 h-4 w-4 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate">{i.title}</p>
                    {i.sub && <p className="truncate text-xs text-muted-foreground">{i.sub}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {tasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {tasks.map((i) => (
                <CommandItem key={i.id} onSelect={() => onPick(i)} value={`task ${i.title}`}>
                  <ListTodo className="mr-2 h-4 w-4 text-accent" />
                  <div className="min-w-0">
                    <p className="truncate">{i.title}</p>
                    {i.sub && <p className="truncate text-xs text-muted-foreground">{i.sub}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {users.length > 0 && (
            <CommandGroup heading="People">
              {users.map((i) => (
                <CommandItem key={i.id} onSelect={() => onPick(i)} value={`user ${i.title} ${i.sub}`}>
                  <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate">{i.title}</p>
                    {i.sub && <p className="truncate text-xs text-muted-foreground">{i.sub}</p>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
