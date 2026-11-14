import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import {
  EdgeHeaders,
  VerifiedEdgeContextSchema,
  type VerifiedEdgeContext,
} from "@core/auth";
import { z } from "zod";

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EDGE_INTERNAL_SECRET: string;
  BACKEND_API_URL: string;
  RBAC_PERMISSIONS_KV: KVNamespace;
}

type Variables = {
  authUserId: string;
  edgeContext: VerifiedEdgeContext;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const membershipSchema = z.object({
  app_id: z.string().uuid(),
  roles: z.object({
    app_id: z.string().uuid(),\n    role_name: z.string().min(1),
    permissions: z.record(z.unknown()),
  }),
  applications: z.object({
    app_code: z.string().min(1),
    is_active: z.boolean(),
  }),
});

const invalidateSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  appCode: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
});

const verifiedIdentityHeaderNames = [
  EdgeHeaders.userId,
  EdgeHeaders.orgId,
  EdgeHeaders.appId,
  EdgeHeaders.userRole,
  EdgeHeaders.userPermissions,
  EdgeHeaders.edgeSecret,
] as const;

function adminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function authClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function cacheKey(userId: string, orgId: string, appCode: string): string {
  return `user:${userId}:org:${orgId}:app:${appCode}`;
}

function jsonError(c: Context<{ Bindings: Env; Variables: Variables }>, status: 400 | 401 | 403 | 404 | 500 | 503, code: string, message: string) {
  return c.json({ error: code, message }, status);
}

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function isAllowedOrigin(env: Env, origin: string): Promise<boolean> {
  let requested: URL;
  try {
    requested = new URL(origin);
  } catch {
    return false;
  }
  if (requested.protocol !== "https:" && requested.hostname !== "localhost") return false;

  const { data, error } = await adminClient(env)
    .from("applications")
    .select("domain")
    .eq("is_active", true)
    .not("domain", "is", null);

  if (error || !data) return false;
  const applicationRows = data as Array<{ domain: string | null }>;\n  return applicationRows.some((row) => {
    const domain = typeof row.domain === "string" ? row.domain.trim() : "";
    if (!domain) return false;
    try {
      const configuredHost = domain.includes("://") ? new URL(domain).hostname : domain.split("/")[0];
      return configuredHost?.toLowerCase() === requested.hostname.toLowerCase();
    } catch {
      return false;
    }
  });
}

// Remove all client-supplied identity assertions before any route/middleware runs.
const worker = {
  async fetch(request: Request, env: Env, executionCtx: ExecutionContext): Promise<Response> {
    const sanitizedHeaders = new Headers(request.headers);
    for (const header of verifiedIdentityHeaderNames) sanitizedHeaders.delete(header);
    const sanitizedRequest = new Request(request, { headers: sanitizedHeaders });
    return app.fetch(sanitizedRequest, env, executionCtx);
  },
};

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin) {
    let allowed = false;
    try {
      allowed = await isAllowedOrigin(c.env, origin);
    } catch {
      allowed = false;
    }
    if (!allowed) return jsonError(c, 403, "origin_not_allowed", "Origin is not registered for an active application.");
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    c.header("Access-Control-Allow-Headers", "Authorization,Content-Type,x-target-org-id,x-target-app-code");
    c.header("Access-Control-Max-Age", "600");
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);

  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
  c.header("Cache-Control", "no-store");
});

const authenticate: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const authorization = c.req.header("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) return jsonError(c, 401, "missing_bearer_token", "A valid Bearer token is required.");

  try {
    const { data, error } = await authClient(c.env).auth.getUser(match[1]);
    if (error || !data.user) return jsonError(c, 401, "invalid_token", "The access token is invalid or expired.");
    c.set("authUserId", data.user.id);
    await next();
  } catch {
    return jsonError(c, 503, "auth_unavailable", "Authentication service is temporarily unavailable.");
  }
};

async function resolveContext(
  env: Env,
  userId: string,
  orgId: string,
  appCode: string,
): Promise<VerifiedEdgeContext | null> {
  const key = cacheKey(userId, orgId, appCode);
  const cached = await env.RBAC_PERMISSIONS_KV.get(key, "json");
  if (cached) {
    const parsed = VerifiedEdgeContextSchema.safeParse(cached);
    if (parsed.success && parsed.data.userId === userId && parsed.data.orgId === orgId) {
      return parsed.data;
    }
    await env.RBAC_PERMISSIONS_KV.delete(key);
  }

  const { data, error } = await adminClient(env)
    .from("user_app_memberships")
    .select("app_id, roles!inner(app_id, role_name, permissions), applications!inner(app_code, is_active)")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("applications.app_code", appCode)
    .eq("applications.is_active", true)
    .maybeSingle();

  if (error) throw new Error("membership_lookup_failed");
  if (!data) return null;

  const membership = membershipSchema.safeParse(data);
  if (!membership.success || membership.data.applications.app_code !== appCode || !membership.data.applications.is_active || membership.data.roles.app_id !== membership.data.app_id) {
    throw new Error("membership_shape_invalid");
  }

  const context = VerifiedEdgeContextSchema.parse({
    userId,
    orgId,
    appId: membership.data.app_id,
    roleName: membership.data.roles.role_name,
    permissions: membership.data.roles.permissions,
  });

  await env.RBAC_PERMISSIONS_KV.put(key, JSON.stringify(context), { expirationTtl: 300 });
  return context;
}

const authorizeTenant: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const orgId = c.req.header("x-target-org-id");
  const appCode = c.req.header("x-target-app-code");
  if (!orgId || !z.string().uuid().safeParse(orgId).success || !appCode || !/^[a-zA-Z0-9_-]{1,100}$/.test(appCode)) {
    return jsonError(c, 400, "invalid_tenant_context", "Valid x-target-org-id and x-target-app-code headers are required.");
  }

  try {
    const context = await resolveContext(c.env, c.get("authUserId"), orgId, appCode);
    if (!context) return jsonError(c, 403, "membership_required", "The user has no active membership for this organization and application.");
    c.set("edgeContext", context);
    await next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message === "membership_shape_invalid") return jsonError(c, 500, "invalid_access_configuration", "The stored role or application data is invalid.");
    return jsonError(c, 503, "authorization_unavailable", "Authorization data could not be loaded.");
  }
};

function verifiedHeaders(context: VerifiedEdgeContext, env: Env): Headers {
  const headers = new Headers();
  headers.set(EdgeHeaders.userId, context.userId);
  headers.set(EdgeHeaders.orgId, context.orgId);
  headers.set(EdgeHeaders.appId, context.appId);
  headers.set(EdgeHeaders.userRole, context.roleName);
  headers.set(EdgeHeaders.userPermissions, JSON.stringify(context.permissions));
  headers.set(EdgeHeaders.edgeSecret, env.EDGE_INTERNAL_SECRET);
  return headers;
}

app.get("/health", (c) => c.json({ status: "ok", service: "business-core-api-gateway" }));

app.get("/api/v1/me/permissions", authenticate, authorizeTenant, (c) => {
  const context = c.get("edgeContext");
  return c.json({
    userId: context.userId,
    orgId: context.orgId,
    appId: context.appId,
    roleName: context.roleName,
    permissions: context.permissions,
  });
});

app.post("/internal/invalidate-cache", async (c) => {
  const suppliedSecret = c.req.header(EdgeHeaders.edgeSecret) ?? "";
  if (!c.env.EDGE_INTERNAL_SECRET || !safeEqual(suppliedSecret, c.env.EDGE_INTERNAL_SECRET)) {
    return jsonError(c, 401, "invalid_internal_secret", "A valid internal secret is required.");
  }

  const parsed = invalidateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 400, "invalid_invalidation_request", "userId, orgId and appCode are required and must be valid.");

  try {
    await c.env.RBAC_PERMISSIONS_KV.delete(cacheKey(
      parsed.data.userId,
      parsed.data.orgId,
      parsed.data.appCode,
    ));
    return c.json({ success: true, invalidated: true });
  } catch {
    return jsonError(c, 503, "cache_invalidation_failed", "The permissions cache could not be invalidated.");
  }
});

const proxy: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c) => {
  if (!c.env.BACKEND_API_URL) return jsonError(c, 503, "backend_not_configured", "The backend API origin is not configured.");
  const context = c.get("edgeContext");
  try {
    const target = new URL(c.req.url);
    const backend = new URL(c.env.BACKEND_API_URL);
    target.protocol = backend.protocol;
    target.host = backend.host;
    target.username = backend.username;
    target.password = backend.password;
    target.pathname = `${backend.pathname.replace(/\/$/, "")}${c.req.path}`;

    const headers = new Headers(c.req.raw.headers);
    for (const name of verifiedHeaderNames) headers.delete(name);
    const trusted = verifiedHeaders(context, c.env);
    trusted.forEach((value, name) => headers.set(name, value));
    headers.delete("host");

    const method = c.req.method.toUpperCase();
    const upstreamRequest = new Request(target.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? null : c.req.raw.body,
      redirect: "manual",
    });
    const response = await fetch(upstreamRequest);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("set-cookie");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("Referrer-Policy", "no-referrer");
    responseHeaders.set("X-Frame-Options", "DENY");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return jsonError(c, 502, "upstream_unavailable", "The backend API request failed.");
  }
};

app.all("/api/*", authenticate, authorizeTenant, proxy);

app.notFound((c) => jsonError(c, 404, "not_found", "The requested endpoint does not exist."));
app.onError((error, c) => {
  // Do not expose internal errors, credentials, or upstream response details.
  console.error("API gateway unhandled error", error instanceof Error ? error.message : "unknown");
  return jsonError(c, 500, "internal_error", "An unexpected gateway error occurred.");
});

export default worker;
