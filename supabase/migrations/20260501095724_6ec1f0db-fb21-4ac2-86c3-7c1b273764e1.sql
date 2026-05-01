-- =========================================================
-- AUDIT LOG
-- =========================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  target_user_id uuid,
  entity_type text NOT NULL,         -- 'user_roles' | 'project_members'
  action text NOT NULL,              -- 'granted' | 'revoked' | 'changed' | 'added' | 'removed'
  old_value text,
  new_value text,
  project_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all audit entries"
ON public.audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- No insert/update/delete policies → only triggers (security definer) can write.

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log (target_user_id);

-- ---------- Trigger: user_roles ----------
CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, target_user_id, entity_type, action, old_value, new_value)
    VALUES (auth.uid(), NEW.user_id, 'user_roles', 'granted', NULL, NEW.role::text);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.audit_log (actor_id, target_user_id, entity_type, action, old_value, new_value)
      VALUES (auth.uid(), NEW.user_id, 'user_roles', 'changed', OLD.role::text, NEW.role::text);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, target_user_id, entity_type, action, old_value, new_value)
    VALUES (auth.uid(), OLD.user_id, 'user_roles', 'revoked', OLD.role::text, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

-- ---------- Trigger: project_members ----------
CREATE OR REPLACE FUNCTION public.audit_project_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, target_user_id, entity_type, action, old_value, new_value, project_id)
    VALUES (auth.uid(), NEW.user_id, 'project_members', 'added', NULL, NEW.role::text, NEW.project_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.audit_log (actor_id, target_user_id, entity_type, action, old_value, new_value, project_id)
      VALUES (auth.uid(), NEW.user_id, 'project_members', 'changed', OLD.role::text, NEW.role::text, NEW.project_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, target_user_id, entity_type, action, old_value, new_value, project_id)
    VALUES (auth.uid(), OLD.user_id, 'project_members', 'removed', OLD.role::text, NULL, OLD.project_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_project_members ON public.project_members;
CREATE TRIGGER trg_audit_project_members
AFTER INSERT OR UPDATE OR DELETE ON public.project_members
FOR EACH ROW EXECUTE FUNCTION public.audit_project_members();

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,            -- 'task_assigned' | 'task_status' | 'mention' | 'system'
  title text NOT NULL,
  message text,
  link text,
  task_id uuid,
  project_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users delete own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Authenticated create notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, read, created_at DESC);

-- ---------- Trigger: notify on task changes ----------
CREATE OR REPLACE FUNCTION public.notify_task_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  pname text;
BEGIN
  SELECT name INTO pname FROM public.projects WHERE id = NEW.project_id;

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, task_id, project_id)
      VALUES (NEW.assigned_to, 'task_assigned',
              'New task assigned: ' || NEW.title,
              'You were assigned a task in ' || COALESCE(pname,'a project'),
              '/projects/' || NEW.project_id, NEW.id, NEW.project_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- assignment change
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       AND NEW.assigned_to IS NOT NULL
       AND NEW.assigned_to <> COALESCE(actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, task_id, project_id)
      VALUES (NEW.assigned_to, 'task_assigned',
              'Task assigned to you: ' || NEW.title,
              'Reassigned in ' || COALESCE(pname,'a project'),
              '/projects/' || NEW.project_id, NEW.id, NEW.project_id);
    END IF;
    -- status change → notify creator if not the actor
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.created_by IS NOT NULL
       AND NEW.created_by <> COALESCE(actor, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, task_id, project_id)
      VALUES (NEW.created_by, 'task_status',
              'Task moved to ' || NEW.status::text,
              NEW.title || ' is now ' || NEW.status::text,
              '/projects/' || NEW.project_id, NEW.id, NEW.project_id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_changes ON public.tasks;
CREATE TRIGGER trg_notify_task_changes
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_changes();

-- =========================================================
-- REALTIME
-- =========================================================
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;