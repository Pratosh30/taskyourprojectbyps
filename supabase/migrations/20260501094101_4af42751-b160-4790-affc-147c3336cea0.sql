-- Allow global admins to view all profiles (for team management screen)
CREATE POLICY "Admins view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow global admins to view all activity log entries
CREATE POLICY "Admins view all activity"
ON public.activity_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow global admins to view all projects (so they can manage membership for any project)
CREATE POLICY "Admins view all projects"
ON public.projects FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow global admins to view all project_members rows
CREATE POLICY "Admins view all project members"
ON public.project_members FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Allow global admins to add/update/remove project members regardless of project role
CREATE POLICY "Admins insert any project members"
ON public.project_members FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update any project members"
ON public.project_members FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete any project members"
ON public.project_members FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
