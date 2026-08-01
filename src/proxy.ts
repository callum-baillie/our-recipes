import { NextRequest, NextResponse } from 'next/server';

import {
  ACTIVE_PROFILE_COOKIE,
  createSignedProfileValue,
  parseSessionBoundProfileValue,
} from '@/lib/actor-context';
import { getRuntimeConfig } from '@/lib/config';
import { authorizeAppRequest } from '@/lib/domain/permissions';
import {
  getAuthenticatedSessionPrincipal,
  isAuthenticationConfigured,
} from '@/lib/services/auth-service';
import { getHouseholdState } from '@/lib/services/household-service';

const LEGACY_COOKIE_NAMES = {
  bord_active_profile: 'our_recipes_active_profile',
  bord_nutrition_access: 'our_recipes_nutrition_access',
  'bord-palette': 'our-recipes-palette',
  'bord-mode': 'our-recipes-mode',
} as const;

function migrateLegacyCookies(request: NextRequest, response: NextResponse): NextResponse {
  for (const [currentName, legacyName] of Object.entries(LEGACY_COOKIE_NAMES)) {
    if (request.cookies.has(currentName)) continue;
    const legacy = request.cookies.get(legacyName);
    if (!legacy) continue;
    response.cookies.set(currentName, legacy.value, {
      path: '/',
      sameSite: currentName === 'bord_nutrition_access' ? 'strict' : 'lax',
      httpOnly: currentName.includes('profile') || currentName.includes('nutrition'),
      secure: request.nextUrl.protocol === 'https:',
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function continueRequest(request: NextRequest, role?: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-bord-pathname', request.nextUrl.pathname);
  if (role) requestHeaders.set('x-bord-role', role);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/examples/') ||
    /\.(?:avif|css|gif|ico|jpe?g|js|json|png|svg|webp|woff2?)$/u.test(pathname)
  );
}

function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/auth/') ||
    pathname === '/sign-in' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/verify-email' ||
    pathname === '/api/v1/auth/recover'
  );
}

function isPublicOperationalPath(pathname: string): boolean {
  return (
    pathname === '/offline' ||
    pathname === '/api/v1/health' ||
    pathname === '/api/v1/release' ||
    pathname.startsWith('/api/v1/branding/icons/')
  );
}

function isIntegrationApiPath(pathname: string): boolean {
  const id = '[0-9a-fA-F-]{36}';
  return [
    new RegExp(`^/api/v1/recipes(?:/bulk|/${id})?$`, 'u'),
    new RegExp(`^/api/v1/meal-plan(?:/bulk|/${id})?$`, 'u'),
    new RegExp(`^/api/v1/shopping-lists(?:/bulk|/${id}(?:/items(?:/${id})?)?)?$`, 'u'),
    new RegExp(`^/api/v1/collections(?:/bulk|/${id}(?:/recipes)?)?$`, 'u'),
    new RegExp(`^/api/v1/pantry/(?:products(?:/${id})?|batches(?:/bulk|/${id})?)$`, 'u'),
  ].some((pattern) => pattern.test(pathname));
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = '';
  return NextResponse.redirect(target);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicAsset(pathname) || isPublicOperationalPath(pathname)) {
    return migrateLegacyCookies(request, continueRequest(request));
  }

  const configured = isAuthenticationConfigured();
  if (!configured) {
    const householdExists = Boolean(getHouseholdState().household);
    const setupAllowed =
      isPublicAuthPath(pathname) ||
      pathname === '/api/v1/setup' ||
      (!householdExists && pathname === '/') ||
      (householdExists && (pathname === '/security-upgrade' || pathname === '/api/v1/auth/enroll'));
    if (setupAllowed) return migrateLegacyCookies(request, continueRequest(request));
    if (pathname.startsWith('/api/')) {
      return apiError(
        503,
        householdExists ? 'security_upgrade_required' : 'setup_required',
        householdExists
          ? 'Finish the one-time security upgrade before using the API.'
          : 'Complete household setup before using the API.',
      );
    }
    return redirectTo(request, householdExists ? '/security-upgrade' : '/');
  }

  if (isPublicAuthPath(pathname)) {
    const principal = await getAuthenticatedSessionPrincipal(request);
    if (principal && pathname === '/sign-in') return redirectTo(request, '/');
    return migrateLegacyCookies(request, continueRequest(request));
  }

  const authorization = request.headers.get('authorization');
  if (authorization) {
    if (!authorization.startsWith('Bearer ') || !isIntegrationApiPath(pathname)) {
      return apiError(
        403,
        'api_key_route_forbidden',
        'API keys may only access the documented integration resources.',
      );
    }
    return continueRequest(request);
  }

  const principal = await getAuthenticatedSessionPrincipal(request);
  if (!principal) {
    if (pathname.startsWith('/api/')) {
      return apiError(401, 'authentication_required', 'Sign in before using this route.');
    }
    const target = request.nextUrl.clone();
    target.pathname = '/sign-in';
    target.search = '';
    if (pathname !== '/')
      target.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(target);
  }

  const permission = authorizeAppRequest({
    role: principal.role,
    profileId: principal.profileId,
    pathname,
    method: request.method,
  });
  if (!permission.allowed) {
    if (pathname.startsWith('/api/')) {
      return apiError(403, permission.code, permission.message);
    }
    return redirectTo(request, pathname.startsWith('/settings') ? '/account/security' : '/');
  }

  const response = migrateLegacyCookies(request, continueRequest(request, principal.role));
  const activeCookie = request.cookies.get(ACTIVE_PROFILE_COOKIE)?.value;
  if (
    !principal.sessionId ||
    parseSessionBoundProfileValue(activeCookie, principal.sessionId) !== principal.profileId
  ) {
    response.cookies.set(
      ACTIVE_PROFILE_COOKIE,
      createSignedProfileValue(principal.profileId, principal.sessionId ?? undefined),
      {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: getRuntimeConfig().isProduction,
        maxAge: 60 * 60 * 24 * 30,
      },
    );
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
