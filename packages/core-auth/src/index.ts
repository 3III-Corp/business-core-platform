import { z } from "zod";

export const EdgeHeaders = {
  userId: "x-user-id",
  orgId: "x-org-id",
  appId: "x-app-id",
  userRole: "x-user-role",
  userPermissions: "x-user-permissions",
  edgeSecret: "x-edge-secret",
} as const;

export const VerifiedEdgeContextSchema = z.object({
  userId: z.string().uuid(),
  orgId: z.string().uuid(),
  appId: z.string().uuid(),
  roleName: z.string().min(1),
  permissions: z.record(z.unknown()),
});

export type VerifiedEdgeContext = z.infer<typeof VerifiedEdgeContextSchema>;

export const EdgeHeadersSchema = z.object({
  [EdgeHeaders.userId]: z.string().uuid(),
  [EdgeHeaders.orgId]: z.string().uuid(),
  [EdgeHeaders.appId]: z.string().uuid(),
  [EdgeHeaders.userRole]: z.string().min(1),
  [EdgeHeaders.userPermissions]: z.string(),
});

export type EdgeHeaderValues = z.infer<typeof EdgeHeadersSchema>;

function permissionAtPath(
  permissions: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = permissions;
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Supports flat action keys ("users.read"), nested JSONB objects
 * ({ users: { read: true } }), and explicit wildcard grants.
 * Wildcards are evaluated only when their value is exactly true.
 */
export function hasPermission(
  permissions: Record<string, unknown>,
  requiredAction: string,
): boolean {
  if (!requiredAction.trim()) return false;
  if (permissions["*"] === true) return true;

  const exact = permissionAtPath(permissions, requiredAction);
  if (exact === true) return true;

  const segments = requiredAction.split(".");
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const wildcardPath = [...segments.slice(0, index), "*"].join(".");
    if (permissionAtPath(permissions, wildcardPath) === true) return true;
  }

  return false;
}
