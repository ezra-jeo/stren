import { describe, expect, it, vi } from 'vitest';
import { listAccessPeople } from '@/lib/access-data';

describe('People & access data', () => {
  it('reads a gym’s staff-side people from gym_users, not removed profile tenancy columns', async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { user_id: 'admin-1', role: 'admin', profiles: [{ name: 'Ari Admin', email: 'ari@example.com' }] },
        { user_id: 'staff-1', role: 'staff', profiles: [{ name: 'Sam Staff', email: 'sam@example.com' }] },
      ],
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ in: inMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    const fromMock = vi.fn().mockReturnValue({ select: selectMock });

    await expect(listAccessPeople({ from: fromMock } as never, 'gym-1')).resolves.toEqual([
      { userId: 'admin-1', name: 'Ari Admin', email: 'ari@example.com', role: 'admin', overrides: [] },
      { userId: 'staff-1', name: 'Sam Staff', email: 'sam@example.com', role: 'staff', overrides: [] },
    ]);

    expect(fromMock).toHaveBeenCalledWith('gym_users');
    expect(selectMock).toHaveBeenCalledWith('user_id, role, profiles!gym_users_user_id_fkey(name, email)');
    expect(eqMock).toHaveBeenCalledWith('gym_id', 'gym-1');
    expect(inMock).toHaveBeenCalledWith('role', ['admin', 'staff']);
  });
});
