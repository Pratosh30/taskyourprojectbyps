import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, UserPlus, X, Crown, Shield } from "lucide-react";
import type { Member } from "@/pages/ProjectDetail";

const emailSchema = z.string().trim().email();

export function MembersPanel({ projectId, members, isAdmin, onChanged, currentUserId }: {
  projectId: string; members: Member[]; isAdmin: boolean; onChanged: () => void; currentUserId: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    if (!emailSchema.safeParse(email).success) return toast.error("Enter a valid email");
    setBusy(true);
    // Look up user via profiles (RLS allows shared-project profiles; this lookup may be blocked for unrelated users)
    const { data: prof, error } = await supabase.from("profiles").select("id,email").eq("email", email.toLowerCase().trim()).maybeSingle();
    if (error) { setBusy(false); return toast.error(error.message); }
    if (!prof) {
      setBusy(false);
      return toast.error("No user found with that email. Ask them to sign up first.");
    }
    const { error: insErr } = await supabase.from("project_members").insert({ project_id: projectId, user_id: prof.id, role: "member" });
    setBusy(false);
    if (insErr) {
      if (insErr.code === "23505") return toast.error("Already a member");
      return toast.error(insErr.message);
    }
    toast.success("Member added");
    setEmail("");
    onChanged();
  };

  const remove = async (userId: string) => {
    const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    onChanged();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="glass rounded-2xl border-0 p-6 shadow-md lg:col-span-2">
        <h3 className="mb-4 font-semibold">Members ({members.length})</h3>
        <ul className="space-y-2">
          {members.map(m => {
            const name = m.profile?.full_name || m.profile?.email || "Unknown";
            return (
              <li key={m.user_id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
                <Avatar className="h-9 w-9"><AvatarFallback className="bg-gradient-primary text-xs text-primary-foreground">{name.slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {m.role === "owner" && <Crown className="mr-1 h-3 w-3" />}
                  {m.role === "admin" && <Shield className="mr-1 h-3 w-3" />}
                  {m.role}
                </Badge>
                {isAdmin && m.role !== "owner" && m.user_id !== currentUserId && (
                  <Button variant="ghost" size="icon" onClick={() => remove(m.user_id)} className="h-8 w-8 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {isAdmin && (
        <Card className="glass h-fit rounded-2xl border-0 p-6 shadow-md">
          <h3 className="mb-1 font-semibold">Invite a teammate</h3>
          <p className="mb-4 text-xs text-muted-foreground">They must already have a Pulse account.</p>
          <div className="space-y-3">
            <Input type="email" placeholder="teammate@team.com" value={email} onChange={e=>setEmail(e.target.value)} />
            <Button onClick={invite} disabled={busy} className="w-full bg-gradient-primary">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Add member
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
