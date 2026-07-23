import { NextRequest, NextResponse } from 'next/server';

const LEGACY_COOKIE_NAMES = {
  bord_active_profile: 'our_recipes_active_profile',
  bord_nutrition_access: 'our_recipes_nutrition_access',
  'bord-palette': 'our-recipes-palette',
  'bord-mode': 'our-recipes-mode',
} as const;

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
