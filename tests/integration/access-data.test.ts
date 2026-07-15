import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listAccessPeople } from '@/lib/access-data';

describe('People & access data', () => {
  it('reads a gym’s staff-side people through the owner-authorized endpoint, not a browser RLS join', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      people: [
        { userId: 'admin-1', name: 'Ari Admin', email: 'ari@example.com', role: 'admin', overrides: [] },
        { userId: 'staff-1', name: 'Sam Staff', email: 'sam@example.com', role: 'staff', overrides: [] },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listAccessPeople({} as SupabaseClient, 'gym-1')).resolves.toEqual([
      { userId: 'admin-1', name: 'Ari Admin', email: 'ari@example.com', role: 'admin', overrides: [] },
      { userId: 'staff-1', name: 'Sam Staff', email: 'sam@example.com', role: 'staff', overrides: [] },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/access/people', { cache: 'no-store' });
  });
});
