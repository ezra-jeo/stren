import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { permissionForPath, type PermissionKey } from '@/lib/permissions';
import { choosePostAuthDestination } from '@/lib/post-auth-destination';
import type { MyGym } from '@/lib/types';

// Keep the Edge guard independent from server-only Supabase helpers. This
// reads only the server-controlled Auth app_metadata claim.
export function isPlatformAdminUser(user: { app_metadata?: Record<string, unknown> } | null): boolean {
  return user?.app_metadata?.platform_role === 'platform_admin';
}

function authPath(url: URL, mode: 'signin' | 'signup', gymCode?: string): string {
  const params = new URLSearchParams(url.search);
  params.set('mode', mode);
  if (gymCode) params.set('gym', gymCode);
  return `/auth?${params.toString()}`;
}

export const LEGACY_AUTH_REDIRECTS = [
  {
    pattern: /^\/app\/auth\/confirm\/?$/,
    target: (_m: RegExpMatchArray, url: URL) => `/auth/confirm${url.search}`,
    status: 307,
  },
  { pattern: /^\/gym\/([^/]+)\/login\/?$/, target: (m: RegExpMatchArray, url: URL) => authPath(url, 'signin', m[1]) },
  { pattern: /^\/gym\/([^/]+)\/signup\/?$/, target: (m: RegExpMatchArray, url: URL) => authPath(url, 'signup', m[1]) },
  { pattern: /^\/login\/?$/, target: (_m: RegExpMatchArray, url: URL) => authPath(url, 'signin') },
  { pattern: /^\/signup\/?$/, target: (_m: RegExpMatchArray, url: URL) => authPath(url, 'signup') },
  { pattern: /^\/signup\/admin\/?$/, target: () => '/for-gym-owners' },
  { pattern: /^\/signup\/member\/?$/, target: (_m: RegExpMatchArray, url: URL) => authPath(url, 'signup') },
  { pattern: /^\/gyms\/new\/?$/, target: () => '/for-gym-owners' },
  { pattern: /^\/(?:register-gym|gym-registration|for-gyms)\/?$/, target: () => '/for-gym-owners' },
  { pattern: new RegExp(`^/gym${'-'}select/?$`), target: () => '/gyms' },
  { pattern: /^\/kiosk\/signup\/?$/, target: () => '/kiosk' },
] as const;

function securityHeaders(response: NextResponse, pathname: string) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', `${pathname.startsWith('/kiosk') || pathname === '/gyms' ? 'camera=(self)' : 'camera=()'}, microphone=(), geolocation=()`);
  return response;
}

function clearAuthCookies(request: NextRequest, response: NextResponse) {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('auth-token')) {
      response.cookies.set(cookie.name, '', { path: '/', expires: new Date(0), maxAge: 0 });
    }
  }
}

function invalidRefresh(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? '');
  return /invalid refresh token|refresh token not found|missing refresh token/i.test(message);
}

function asMyGyms(rows: unknown): MyGym[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const value = row as Record<string, unknown>;
    return { gymId: String(value.gym_id), code: String(value.code), name: String(value.name), logoUrl: typeof value.logo_url === 'string' ? value.logo_url : null, role: value.role as MyGym['role'], status: value.status as MyGym['status'] };
  });
}

export function isDemoMemberPath(pathname: string): boolean {
  return pathname === '/member/demo' || pathname.startsWith('/member/demo/');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  for (const redirect of LEGACY_AUTH_REDIRECTS) {
    const match = pathname.match(redirect.pattern);
    if (match) {
      const status = 'status' in redirect ? redirect.status : 308;
      return securityHeaders(NextResponse.redirect(new URL(redirect.target(match, new URL(request.url)), request.url), status), pathname);
    }
  }

  let response = NextResponse.next({ request });
  const finish = (next: NextResponse) => securityHeaders(next, pathname);
  if (pathname.startsWith('/api')) return finish(response);

  const isPublic = pathname === '/' || pathname.startsWith('/landing') || pathname === '/auth/callback' || pathname === '/auth/confirm' || pathname === '/reset-password' || pathname === '/for-gym-owners' || pathname === '/claim' || pathname.startsWith('/claim/') || (/^\/gym\/[^/]+(?:\/.*)?$/.test(pathname));
  if (isPublic) return finish(response);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user = null;
  try {
    user = (await supabase.auth.getUser()).data.user;
  } catch (error) {
    if (!invalidRefresh(error)) throw error;
    const target = NextResponse.redirect(new URL('/auth?mode=signin', request.url));
    clearAuthCookies(request, target);
    return finish(target);
  }

  const isAuthRoute = pathname === '/auth';
  if (!user) return isAuthRoute ? finish(response) : finish(NextResponse.redirect(new URL('/auth?mode=signin', request.url)));

  // Platform operators may not have an active gym, so this branch must run
  // before the ordinary gym-access lookup. The claim lives in server-controlled
  // app_metadata; user-editable metadata is intentionally ignored.
  if (pathname === '/superadmin' || pathname.startsWith('/superadmin/')) {
    if (!isPlatformAdminUser(user)) {
      return finish(NextResponse.redirect(new URL('/gyms', request.url)));
    }
    return finish(response);
  }

  if (isAuthRoute) {
    const [{ data: rows, error: gymsError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.rpc('get_my_gyms'),
      supabase.from('profiles').select('active_gym_id').eq('id', user.id).maybeSingle(),
    ]);
    if (gymsError || profileError) {
      return finish(NextResponse.redirect(new URL('/gyms?account_error=access', request.url)));
    }
    const destination = choosePostAuthDestination(asMyGyms(rows), profile?.active_gym_id ?? null, request.nextUrl.searchParams.get('gym') ?? undefined);
    if (destination.activateGymId) {
      const { error: activationError } = await supabase.rpc('set_active_gym', { p_gym_id: destination.activateGymId });
      if (activationError) return finish(NextResponse.redirect(new URL('/gyms?account_error=access', request.url)));
    }
    return finish(NextResponse.redirect(new URL(destination.path, request.url)));
  }

  if (isDemoMemberPath(pathname)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-demo-mode', '1');
    requestHeaders.set('x-user-role', 'member');
    response = NextResponse.next({ request: { headers: requestHeaders } });
    return finish(response);
  }

  if (pathname === '/gyms' || pathname === '/profile') return finish(response);

  const { data, error } = await supabase.rpc('get_my_access');
  const access = data && typeof data === 'object' ? data as { role?: string; gym_id?: string; permissions?: string[]; features?: Record<string, boolean> } : null;
  if (error) return finish(NextResponse.redirect(new URL('/gyms?account_error=access', request.url)));
  if (!access?.role || !access.gym_id) return finish(NextResponse.redirect(new URL('/gyms', request.url)));

  const manager = ['owner', 'admin', 'staff'].includes(access.role);
  const managerSurface = pathname.startsWith('/admin') || pathname.startsWith('/kiosk');
  if (managerSurface && !manager) return finish(NextResponse.redirect(new URL('/member', request.url)));

  if (managerSurface) {
    const permissions = new Set<PermissionKey>((access.permissions ?? []) as PermissionKey[]);
    const required = permissionForPath(pathname);
    const kioskEnabled = access.features?.kiosk_checkin !== false;
    if ((required && !permissions.has(required)) || (pathname.startsWith('/kiosk') && !kioskEnabled)) {
      const fallback = permissions.has('dashboard:view') ? '/admin' : permissions.has('members:view') ? '/admin/members' : '/member';
      return finish(NextResponse.redirect(new URL(fallback, request.url)));
    }
  }

  response.headers.set('x-gym-id', access.gym_id);
  response.headers.set('x-user-role', access.role);
  return finish(response);
}

export const config = { matcher: ['/((?!_next/static|_next/image|_vercel/|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)'] };
