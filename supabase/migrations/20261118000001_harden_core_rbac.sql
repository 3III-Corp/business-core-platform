-- Harden core RBAC policies, profile privilege boundaries, and membership integrity.
-- Apply through the normal reviewed Supabase migration workflow.

-- SECURITY DEFINER trigger function: pin the search path and prevent direct RPC calls.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

-- Prevent self-service escalation through profiles.is_super_admin.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON TABLE public.profiles TO authenticated;

-- Evaluate auth helpers once per statement rather than once per candidate row.
DROP POLICY IF EXISTS "Users can view assigned organizations" ON public.organizations;
CREATE POLICY "Users can view assigned organizations"
  ON public.organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_app_memberships AS m
      WHERE m.user_id = (SELECT auth.uid())
        AND m.org_id = organizations.id
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view active applications" ON public.applications;
CREATE POLICY "Authenticated users can view active applications"
  ON public.applications
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated' AND is_active = true);

DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.roles;
CREATE POLICY "Authenticated users can view roles"
  ON public.roles
  FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "Users can view own app memberships" ON public.user_app_memberships;
CREATE POLICY "Users can view own app memberships"
  ON public.user_app_memberships
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING ((SELECT auth.uid()) = id);

-- Index foreign-key columns used in membership joins and lookups.
CREATE INDEX IF NOT EXISTS user_app_memberships_org_id_idx
  ON public.user_app_memberships (org_id);
CREATE INDEX IF NOT EXISTS user_app_memberships_app_id_idx
  ON public.user_app_memberships (app_id);
CREATE INDEX IF NOT EXISTS user_app_memberships_role_id_idx
  ON public.user_app_memberships (role_id);

-- Enforce that a membership's selected role belongs to the same application.
ALTER TABLE public.roles
  ADD CONSTRAINT roles_id_app_id_key UNIQUE (id, app_id);

ALTER TABLE public.user_app_memberships
  DROP CONSTRAINT IF EXISTS user_app_memberships_role_id_fkey;

ALTER TABLE public.user_app_memberships
  ADD CONSTRAINT user_app_memberships_role_app_fkey
  FOREIGN KEY (role_id, app_id)
  REFERENCES public.roles (id, app_id)
  ON DELETE RESTRICT;
