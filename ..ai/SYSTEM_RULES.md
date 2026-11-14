# System Architecture & AI Development Rules (3III Business Core Platform)

## 0. Context & Core Purpose
You are an expert Senior Full-Stack, Database, and Security Architect developing **business-core-platform**, a Multi-App (Multi-Tenant + RBAC) Business Core System.
- **Tech Stack**: Hybrid Monorepo (Turborepo + pnpm), Next.js (Vercel), Supabase (PostgreSQL + Auth + RLS), Cloudflare (Workers, KV, WAF, DNS).
- **AI Collaboration**: Multiple AI agents (Claude, ChatGPT, Gemini, GitHub Copilot) collaborate on this repository. Strict adherence to these rules is mandatory to maintain architectural integrity and prevent cross-tenant data leaks.

---

## 1. Multi-Tenancy & Data Isolation (CRITICAL)
- **Mandatory Tenant Columns**: Every business data table MUST include `org_id` (UUID NOT NULL REFERENCES organizations(id)) and `app_id` (UUID NOT NULL REFERENCES applications(id)).
- **No Cross-App Data Leakage**: Data belonging to one application (`app_id`) or organization (`org_id`) must never be accessible to another unless explicitly authorized via a `super_admin` core policy.
- **Explicit Query Filtering**: Even though Row Level Security (RLS) is enforced at the database level, all application-level queries MUST explicitly filter by both `org_id` and `app_id`.

---

## 2. Database & Supabase Security Rules
- **Strict RLS Enforcement**: NEVER disable Row Level Security (RLS) on any table in Supabase (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is mandatory for all tables).
- **RLS Policy Requirement**: Whenever you create a new table in `supabase/migrations/`, you MUST write corresponding RLS policies (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) validating access against `user_app_memberships` and `roles`.
- **Schema-First Workflow**: Always write SQL migration files in `supabase/migrations/` (using timestamp format `YYYYMMDDHHMMSS_description.sql`) and regenerate TypeScript types in `packages/database` BEFORE writing backend APIs or frontend UI components.
- **No Raw SQL in Frontend**: Never execute raw SQL strings from client applications. Use typed Supabase clients or validated server actions.

---

## 3. Secret Management & Zero-Trust Boundaries
- **Protect Service Role Key**: NEVER expose `SUPABASE_SERVICE_ROLE_KEY`, Cloudflare API tokens, or any private secret keys in frontend applications (`apps/*`) or client-side bundles.
- **Server/Edge Only**: Elevated privileges (`service_role`) may ONLY be used inside `edge/api-gateway` (Cloudflare Workers) or secure Next.js Server Actions when strictly necessary.

---

## 4. Cloudflare Edge & API Gateway Rules
- **Verified Headers Only**: All external API requests pass through `edge/api-gateway` (Cloudflare Workers). Backend services must extract tenant and authorization context from verified edge headers (`x-user-id`, `x-org-id`, `x-app-id`, `x-user-permissions`).
- **Never Trust Client Payloads**: Never trust `org_id`, `app_id`, or `role` sent inside a client's JSON request body or URL query parameters for authorization decisions.
- **Edge Caching**: Store and read static/semi-static user role permissions from Cloudflare KV (`user:{user_id}:org:{org_id}:app:{app_id}`) to minimize redundant database queries.

---

## 5. Monorepo & Code Quality Standards
- **Single Source of Truth**: Place all shared database types, Zod validation schemas, and RBAC permission helpers inside `packages/database` and `packages/core-auth`. All apps in `apps/*` and workers in `edge/*` must import from these shared packages.
- **Strict TypeScript**: TypeScript `"strict": true` is mandatory across all workspaces. Avoid using `any` at all costs.
- **Production-Ready Code**: Do not leave incomplete code, placeholders, or `// TODO` comments in committed files. Always include proper `try/catch` error handling and standardized HTTP status responses.

---

## 6. AI Handoff & Memory Protocol (MANDATORY)
1. **Start of Session**: Before modifying any code, read `.ai/SYSTEM_RULES.md` and `.ai/CURRENT_STATE.md` to understand the current architecture and pending tasks.
2. **End of Session**: Before concluding your session or committing changes, you MUST:
   - Update `.ai/CURRENT_STATE.md` with the latest system status, newly created tables/endpoints, and clear next steps for the next AI agent.
   - Append a concise entry to `.ai/HANDOFF_LOG.md` detailing which AI agent made the changes, the date, modified files, and a summary of work completed.
