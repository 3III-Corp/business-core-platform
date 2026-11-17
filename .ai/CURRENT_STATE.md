# Current Project State

## Completed Milestones
1. **Repository & Rules**: `.ai/SYSTEM_RULES.md` defines multi-tenant isolation, strict RLS, secret boundaries, verified Cloudflare edge headers, and AI handoff requirements.
2. **Database & GitOps**: Initial migration `supabase/migrations/20261115000001_init_core_rbac.sql` creates `organizations`, `profiles`, `applications`, `roles`, and `user_app_memberships` with RLS enabled.
3. **Monorepo foundations**: Existing root `package.json`, `pnpm-workspace.yaml`, and `turbo.json` are retained. Added strict shared TypeScript config at `packages/tsconfig/base.json`.
4. **Shared RBAC package**: Added `packages/core-auth` with Zod validation for verified edge context and standard trusted headers, plus JSONB permission evaluation.
5. **Cloudflare API Gateway**: Added Hono Worker at `edge/api-gateway` with Supabase token verification, membership/role/application lookup, five-minute KV permission cache, trusted-header injection, registered-application CORS, health and permissions endpoints, backend proxying, and protected cache invalidation.
6. **Operational documentation**: Added `edge/api-gateway/README.md` with required environment, KV, secret, request, and deployment setup.

## Gateway Endpoints
- `GET /health`: public liveness endpoint.
- `GET /api/v1/me/permissions`: authenticated verified permission context; requires `Authorization: Bearer`, `x-target-org-id`, and `x-target-app-code`.
- `POST /internal/invalidate-cache`: requires `x-edge-secret` and `{ "userId": "<uuid>", "orgId": "<uuid>", "appCode": "<code>" }`.
- `/api/*`: authenticated and membership-authorized requests are forwarded to `BACKEND_API_URL` with server-generated trusted identity headers.

## Required Deployment Configuration
- Replace production and preview KV namespace IDs in `edge/api-gateway/wrangler.toml`.
- Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `BACKEND_API_URL` for the target environment.
- Set `SUPABASE_SERVICE_ROLE_KEY` and `EDGE_INTERNAL_SECRET` using Wrangler secrets; never commit these values.
- Ensure active `applications.domain` values are populated with the frontend hostnames allowed by CORS.
- Install dependencies and run workspace typechecks/builds, then deploy the Worker. No Cloudflare deployment or runtime smoke test was performed in the repository-only change.

## Known Database Follow-ups
- The current SQL migration does not provide full CRUD policies on every table; it currently defines selected SELECT/UPDATE policies only. Do not assume admin write paths are ready.
- Review profile self-update permissions for the `is_super_admin` column and harden the `SECURITY DEFINER` trigger function with a fixed safe `search_path` and minimal execution grants.
- The gateway verifies that the joined role belongs to the same application as the membership, but the database should also enforce this invariant with a composite foreign key/constraint in a future migration.
- Role or membership changes must trigger `POST /internal/invalidate-cache` from a trusted administrative backend; otherwise cached permissions can remain active for up to 300 seconds.

## Next Steps
1. Install workspace dependencies and run `pnpm --filter @core/auth typecheck` and `pnpm --filter @edge/api-gateway typecheck`; resolve any compiler issues.
2. Provision KV namespaces, configure Wrangler vars/secrets, and deploy to a non-production environment for integration tests.
3. Add automated tests for authentication failures, cross-tenant denial, role/app mismatch, permission parsing, CORS, proxy header spoofing, and cache invalidation.
4. Add trusted admin-side cache invalidation calls and database-side constraints/policy hardening before production rollout.
5. **Error investigation (2026-11-17)**: No error text, stack trace, or failing location was included in the request (`[paste error here]` is a placeholder), so root-cause analysis could not begin. Request the complete error and relevant runtime context before diagnosing; no code or architecture change was made.
