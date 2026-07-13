import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, revalidatePathMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({ rpc: rpcMock }),
}));

import {
  verifyMembershipAction,
  saveGymAction,
  sendVerificationReminderAction,
  withdrawVerificationAction,
} from '@/lib/auth-actions';

beforeEach(() => {
  rpcMock.mockReset();
  revalidatePathMock.mockReset();
});

describe('gym discovery actions', () => {
  it('returns the database-enforced membership match result and refreshes the gym hub', async () => {
    rpcMock.mockResolvedValue({ data: { status: 'active', role: 'member', matched: true }, error: null });

    await expect(verifyMembershipAction('gym-1')).resolves.toEqual({ status: 'active', role: 'member', matched: true });
    expect(rpcMock).toHaveBeenCalledWith('verify_gym_membership', { p_gym_id: 'gym-1' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/gyms');
  });

  it('exposes save, reminder, and withdrawal through their scoped RPCs', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { saved: true }, error: null })
      .mockResolvedValueOnce({ data: { next_reminder_at: '2026-07-20T00:00:00Z' }, error: null })
      .mockResolvedValueOnce({ data: { withdrawn: true }, error: null });

    await expect(saveGymAction('gym-1', true)).resolves.toEqual({ saved: true });
    await expect(sendVerificationReminderAction('gym-1')).resolves.toEqual({ nextReminderAt: '2026-07-20T00:00:00Z' });
    await expect(withdrawVerificationAction('gym-1')).resolves.toEqual({ withdrawn: true });
    expect(rpcMock.mock.calls.map(([name]) => name)).toEqual([
      'save_gym',
      'send_membership_verification_reminder',
      'withdraw_membership_verification',
    ]);
  });
});
