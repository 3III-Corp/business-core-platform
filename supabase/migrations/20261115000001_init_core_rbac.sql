-- ============================================================================
-- 1. CORE IDENTITY & MULTI-TENANT TABLES
-- ============================================================================

-- ตารางองค์กร / ลูกค้า (Tenants)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ตารางข้อมูลผู้ใช้งาน (เชื่อมตรงกับ Supabase Auth)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ตารางทะเบียนแอปพลิเคชันในเครือ (Multi-App Registry)
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. ACCESS CONTROL & RBAC TABLES
-- ============================================================================

-- ตารางบทบาทสิทธิ์แยกตามแอปพลิเคชัน
CREATE TABLE public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(app_id, role_name)
);

-- ตารางจับคู่สิทธิ์ผู้ใช้งาน (User + Org + App + Role)
CREATE TABLE public.user_app_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id, app_id)
);

-- ============================================================================
-- 3. AUTOMATION TRIGGERS (Auto-create Profile on Signup)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_app_memberships ENABLE ROW LEVEL SECURITY;

-- Profiles: ผู้ใช้ดูและแก้ไขข้อมูลตัวเองได้
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Organizations: ผู้ใช้เห็นเฉพาะองค์กรที่ตัวเองเป็นสมาชิกอยู่
CREATE POLICY "Users can view assigned organizations" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_app_memberships m
      WHERE m.user_id = auth.uid() AND m.org_id = organizations.id
    )
  );

-- Applications: ผู้ใช้ที่ล็อกอินแล้วสามารถดูรายชื่อแอปที่เปิดใช้งานได้
CREATE POLICY "Authenticated users can view active applications" ON public.applications
  FOR SELECT USING (auth.role() = 'authenticated' AND is_active = true);

-- Roles: ผู้ใช้ที่ล็อกอินแล้วสามารถอ่านโครงสร้างสิทธิ์ของแอปได้
CREATE POLICY "Authenticated users can view roles" ON public.roles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Memberships: ผู้ใช้เห็นรายการสิทธิ์การเข้าถึงแอปของตัวเอง
CREATE POLICY "Users can view own app memberships" ON public.user_app_memberships
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 5. SEED INITIAL CORE APPLICATION
-- ============================================================================

INSERT INTO public.applications (app_code, name, is_active)
VALUES ('core-admin', '3III Core Administration Portal', true);
