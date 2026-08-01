import { z } from 'zod';

export const appRoles = ['admin', 'parent', 'child'] as const;
export const appRoleSchema = z.enum(appRoles);
export type AppRole = z.infer<typeof appRoleSchema>;

export const appCapabilities = [
  'shared.read',
  'shared.create',
  'shared.update',
  'shared.delete',
  'personal.read',
  'personal.create',
  'personal.update',
  'personal.delete',
  'ai.use',
  'settings.manage',
  'profiles.manage',
  'guardians.manage',
  'backups.manage',
  'diagnostics.manage',
  'apiKeys.manage',
  'accountSecurity.manageOwn',
] as const;

export type AppCapability = (typeof appCapabilities)[number];

const roleRank: Record<AppRole, number> = {
  child: 0,
  parent: 1,
  admin: 2,
};

const roleCapabilities: Record<AppRole, ReadonlySet<AppCapability>> = {
  admin: new Set(appCapabilities),
  parent: new Set([
    'shared.read',
    'shared.create',
    'shared.update',
    'shared.delete',
    'personal.read',
    'personal.create',
    'personal.update',
    'personal.delete',
    'ai.use',
    'accountSecurity.manageOwn',
  ]),
  child: new Set([
    'shared.read',
    'personal.read',
    'personal.create',
    'personal.update',
    'accountSecurity.manageOwn',
  ]),
};

export function normalizeAppRole(value: string | null | undefined): AppRole {
  if (value === 'admin' || value === 'child') return value;
  return 'parent';
}

export function effectiveAppRole(accountRole: AppRole, activeProfileRole: AppRole): AppRole {
  return roleRank[accountRole] <= roleRank[activeProfileRole] ? accountRole : activeProfileRole;
}

export function appRoleCan(role: AppRole, capability: AppCapability): boolean {
  return roleCapabilities[role].has(capability);
}

export function isRoleElevation(currentRole: AppRole, targetRole: AppRole): boolean {
  return roleRank[targetRole] > roleRank[currentRole];
}

const readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export type RequestPermissionDecision =
  | { allowed: true }
  | { allowed: false; code: 'forbidden' | 'personal_scope_required'; message: string };

export function authorizeAppRequest(input: {
  role: AppRole;
  profileId: string;
  pathname: string;
  method: string;
}): RequestPermissionDecision {
  const { role, profileId, pathname } = input;
  const method = input.method.toUpperCase();
  const isRead = readMethods.has(method);

  if (pathname === '/account/security' || pathname.startsWith('/api/auth/')) {
    return { allowed: true };
  }

  if (
    pathname.startsWith('/settings') ||
    pathname.startsWith('/api/v1/admin/') ||
    pathname.startsWith('/api/v1/backups') ||
    pathname.startsWith('/api/v1/diagnostics') ||
    pathname.startsWith('/api/v1/settings')
  ) {
    return appRoleCan(role, 'settings.manage')
      ? { allowed: true }
      : {
          allowed: false,
          code: 'forbidden',
          message: 'Only an admin can manage household settings.',
        };
  }

  if (pathname.startsWith('/api/v1/profiles')) {
    if (isRead || /\/active$/u.test(pathname)) return { allowed: true };
    return appRoleCan(role, 'profiles.manage')
      ? { allowed: true }
      : {
          allowed: false,
          code: 'forbidden',
          message: 'Only an admin can manage household profiles.',
        };
  }

  if (role !== 'child') return { allowed: true };

  if (pathname === '/api/v1/nutrition/household') {
    return {
      allowed: false,
      code: 'personal_scope_required',
      message: 'Child accounts cannot view other household members’ Nutrition data.',
    };
  }

  const nutritionProfileMatch = pathname.match(
    /^\/api\/v1\/nutrition\/profiles\/([0-9a-fA-F-]{36})(?:\/|$)/u,
  );
  if (nutritionProfileMatch) {
    if (nutritionProfileMatch[1] !== profileId) {
      return {
        allowed: false,
        code: 'personal_scope_required',
        message: 'Child accounts can only access their own personal entries.',
      };
    }
    if (method === 'DELETE' || pathname.endsWith('/delete')) {
      return {
        allowed: false,
        code: 'forbidden',
        message: 'Child accounts cannot delete entries.',
      };
    }
    return { allowed: true };
  }

  if (pathname === '/api/v1/nutrition/identity' || pathname === '/api/v1/nutrition/session') {
    return { allowed: true };
  }

  if (!pathname.startsWith('/api/') && isRead) return { allowed: true };
  if (pathname.startsWith('/api/') && isRead) return { allowed: true };

  return {
    allowed: false,
    code: 'forbidden',
    message: 'Child accounts can view shared content but cannot change it.',
  };
}

export const roleSelectionSchema = z
  .object({
    role: appRoleSchema,
  })
  .strict();

export const guardianAssignmentSchema = z
  .object({
    parentProfileId: z.string().uuid(),
    childProfileId: z.string().uuid(),
    enabled: z.boolean(),
  })
  .strict()
  .refine((value) => value.parentProfileId !== value.childProfileId, {
    message: 'A profile cannot be its own guardian.',
  });
