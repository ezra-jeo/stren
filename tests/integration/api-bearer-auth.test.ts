import { describe, expect, it, vi } from 'vitest';
import { resolveApiRequestUser } from '@/lib/api-request-auth';

describe('API bearer authentication', () => {
  it('carries a verified bearer token into the client used for authorization queries', async () => {
    const bearerClient = { marker: 'bearer-scoped' };
    const getUser = vi.fn(async (token?: string) => token
      ? { data: { user: { id: 'bearer-user' } }, error: null }
      : { data: { user: null }, error: { message: 'no cookie session' } });
    const cookieClient = { auth: { getUser } };
    const createBearerClient = vi.fn(() => bearerClient);

    const resolved = await resolveApiRequestUser(
      new Request('https://stren.test/api/admin/revalidate-gym', {
        headers: { authorization: 'Bearer verified-token' },
      }),
      cookieClient as never,
      createBearerClient as never,
    );

    expect(resolved).toEqual({ user: { id: 'bearer-user' }, supabase: bearerClient });
    expect(createBearerClient).toHaveBeenCalledWith('verified-token');
  });
});
