import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdminApi } from '@/lib/platform-admin';
import { createAdminClient } from '@/lib/supabase-admin';

export interface EmailCheckResponse {
  exists: boolean;
  ownsOrManagesGymCount: number;
  pendingInvite: { gymName: string; expiresAt: string } | null;
}

type UntypedRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
};

const querySchema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function GET(request: Request) {
  const auth = await requirePlatformAdminApi();
  if (auth.response) return auth.response;
  const parsed = querySchema.safeParse({ email: new URL(request.url).searchParams.get('email') ?? '' });
  if (!parsed.success) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });

  // Auth is the only privileged client operation in this route. Postgres
  // platform metadata remains behind user-bound RPCs and is not exposed here.
  const admin = createAdminClient();
  let exists = false;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ error: 'Account lookup failed.' }, { status: 500 });
    exists = data.users.some((user) => user.email?.toLowerCase() === parsed.data.email);
    if (exists || data.users.length < 1000) break;
  }

  const { data: resolution, error: resolutionError } = await (auth.context.supabase as unknown as UntypedRpcClient).rpc(
    'get_platform_account_resolution',
    { p_email: parsed.data.email },
  );
  if (resolutionError) return NextResponse.json({ error: resolutionError.message }, { status: 500 });

  const advisory = (resolution ?? {}) as {
    exists?: boolean;
    ownsOrManagesGymCount?: number;
    pendingInvite?: { gymName: string; expiresAt: string } | null;
  };
  const response: EmailCheckResponse = {
    exists: exists || advisory.exists === true,
    ownsOrManagesGymCount: advisory.ownsOrManagesGymCount ?? 0,
    pendingInvite: advisory.pendingInvite ?? null,
  };
  return NextResponse.json(response);
}
