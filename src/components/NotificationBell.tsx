import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, CheckCheck, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow, parseISO } from "date-fns";

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("notifications")
      .select("id,type,title,message,link,read,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data as Notif[]) || []);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const unread = items.filter((i) => !i.read).length;

  const markOne = async (id: string) => {
    await (supabase as any).from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
  };
  const markAll = async () => {
    await (supabase as any).from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">You're all caught up.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              <AnimatePresence initial={false}>
                {items.map((n) => {
                  const inner = (
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm ${n.read ? "text-muted-foreground" : "font-medium"}`}>{n.title}</p>
                        {n.message && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>}
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.read && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); markOne(n.id); }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Mark read"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                  return (
                    <motion.li
                      key={n.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="px-4 py-3 transition hover:bg-muted/40"
                    >
                      {n.link ? (
                        <Link to={n.link} onClick={() => { setOpen(false); if (!n.read) markOne(n.id); }}>{inner}</Link>
                      ) : inner}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
