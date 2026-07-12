import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { permissionForPath, type PermissionKey } from '@/lib/permissions';
import { choosePostAuthDestination } from '@/lib/post-auth-destination';
import type { MyGym } from '@/lib/types';

export const LEGACY_AUTH_REDIRECTS = [
  { pattern: /^\/gym\/([^/]+)\/login\/?$/, target: (m: RegExpMatchArray) => `/login?gym=${encodeURIComponent(m[1])}` },
  { pattern: /^\/gym\/([^/]+)\/signup\/?$/, target: (m: RegExpMatchArray) => `/signup?gym=${encodeURIComponent(m[1])}` },
  { pattern: /^\/signup\/admin\/?$/, target: () => '/gyms/new' },
  { pattern: /^\/signup\/member\/?$/, target: () => '/signup' },
  { pattern: new RegExp(`^/gym${'-'}select/?$`), target: () => '/gyms' },
  { pattern: /^\/kiosk\/signup\/?$/, target: () => '/kiosk' },
] as const;

function securityHeaders(response: NextResponse, pathname: string) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', `${pathname.startsWith('/kiosk') ? 'camera=(self)' : 'camera=()'}, microphone=(), geolocation=()`);
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  for (const redirect of LEGACY_AUTH_REDIRECTS) {
    const match = pathname.match(redirect.pattern);
    if (match) return securityHeaders(NextResponse.redirect(new URL(redirect.target(match), request.url), 308), pathname);
  }

  let response = NextResponse.next({ request });
  const finish = (next: NextResponse) => securityHeaders(next, pathname);
  if (pathname.startsWith('/api')) return finish(response);

  const isPublic = pathname === '/' || pathname.startsWith('/landing') || pathname === '/auth/callback' || pathname === '/reset-password' || (/^\/gym\/[^/]+(?:\/.*)?$/.test(pathname));
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
    const target = NextResponse.redirect(new URL('/login', request.url));
    clearAuthCookies(request, target);
    return finish(target);
  }

  const isAuthRoute = pathname === '/login' || pathname === '/signup';
  if (!user) return isAuthRoute ? finish(response) : finish(NextResponse.redirect(new URL('/login', request.url)));

  if (isAuthRoute) {
    const [{ data: rows }, { data: profile }] = await Promise.all([
      supabase.rpc('get_my_gyms'),
      supabase.from('profiles').select('active_gym_id').eq('id', user.id).maybeSingle(),
    ]);
    const destination = choosePostAuthDestination(asMyGyms(rows), profile?.active_gym_id ?? null, request.nextUrl.searchParams.get('gym') ?? undefined);
    if (destination.activateGymId) await supabase.rpc('set_active_gym', { p_gym_id: destination.activateGymId });
    return finish(NextResponse.redirect(new URL(destination.path, request.url)));
  }

  if (pathname === '/gyms' || pathname === '/gyms/new') return finish(response);

  const { data, error } = await supabase.rpc('get_my_access');
  const access = data && typeof data === 'object' ? data as { role?: string; gym_id?: string; permissions?: string[]; features?: Record<string, boolean> } : null;
  if (error || !access?.role || !access.gym_id) return finish(NextResponse.redirect(new URL('/gyms', request.url)));

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

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)'] };
