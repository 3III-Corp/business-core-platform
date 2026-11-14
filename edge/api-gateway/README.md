# Cloudflare API Gateway

Hono-based Cloudflare Worker that validates Supabase access tokens, resolves a user's organization/application membership, caches verified RBAC context in KV for 300 seconds, and forwards API requests with trusted edge headers.

## Required setup

1. Create production and preview KV namespaces, then replace both IDs in `wrangler.toml`.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for the target environment. These are project configuration values, not service-role credentials.
3. Configure Worker secrets (never commit these values):
   ```sh
   pnpm --filter @edge/api-gateway exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   pnpm --filter @edge/api-gateway exec wrangler secret put EDGE_INTERNAL_SECRET
   ```
4. Set `BACKEND_API_URL` to the trusted backend origin. The gateway forwards `/api/*` paths to this origin.
5. Ensure each active row in `public.applications` has a `domain` value matching the browser application's hostname. CORS uses this registry; unknown origins are rejected.
6. Install workspace dependencies from the repository root and run the typecheck before deploying.

## Request contract

- Client sends `Authorization: Bearer <Supabase access token>`, `x-target-org-id` (UUID), and `x-target-app-code`.
- Client-supplied `x-user-id`, `x-org-id`, `x-app-id`, `x-user-role`, `x-user-permissions`, and `x-edge-secret` are removed at the Worker entry point.
- The Worker authenticates the token, resolves `user_app_memberships` joined to `roles` and `applications`, and injects verified identity headers only on the upstream request.
- `GET /health` is a public liveness check.
- `GET /api/v1/me/permissions` returns the verified context and requires the two target headers plus a valid bearer token.
- `POST /internal/invalidate-cache` requires `x-edge-secret` and JSON `{ "userId": "...", "orgId": "...", "appCode": "..." }`.

## Operational/security notes

- KV is an optimization, not the source of truth. Cached authorization can remain effective for up to five minutes unless the exact cache key is invalidated.
- Invoke cache invalidation from a trusted administrative backend after role or membership changes. Do not expose the internal secret to browser applications.
- The existing SQL migration stores `roles.permissions` as JSONB and relates memberships to roles by `role_id`; the Worker validates the returned shape before caching it.
- The Worker does not create database objects or alter Supabase policies. Review and harden database write policies separately before enabling self-service role administration.
