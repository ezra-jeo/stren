import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type RequestUser = { id: string };
type BearerClientFactory = (accessToken: string) => SupabaseClient;

export function createBearerSupabaseClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

/**
 * Resolve the caller and the matching Supabase client. Bearer-only callers must
 * use a bearer-scoped client for every subsequent RLS/RPC authorization query;
 * verifying a token on the cookie client does not attach it to PostgREST calls.
 */
export async function resolveApiRequestUser(
  request: Request,
  cookieClient: SupabaseClient,
  createBearerClient: BearerClientFactory = createBearerSupabaseClient,
): Promise<{ user: RequestUser; supabase: SupabaseClient } | null> {
  const {
    data: { user },
    error: userError,
  } = await cookieClient.auth.getUser();

  if (!userError && user) {
    return { user: { id: user.id }, supabase: cookieClient };
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : '';
  if (!token) return null;

  const {
    data: { user: bearerUser },
    error: bearerError,
  } = await cookieClient.auth.getUser(token);

  if (bearerError || !bearerUser) return null;
  return {
    user: { id: bearerUser.id },
    supabase: createBearerClient(token),
  };
}
