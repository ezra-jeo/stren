import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivateDataScope } from '@/lib/private-cache';

const fetchMyAccessMock = vi.fn();
const authState: {
  profile: { id: string; role: 'owner'; gymId: string } | null;
  activeScope: PrivateDataScope | null;
  isLoading: boolean;
} = {
  profile: { id: 'account-a', role: 'owner', gymId: 'gym-a' },
  activeScope: null,
  isLoading: false,
};

vi.mock('@/lib/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/lib/access-data', () => ({ fetchMyAccess: (...args: unknown[]) => fetchMyAccessMock(...args) }));
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));

import { AccessProvider, useAccess } from '@/lib/access-context';

function Probe() {
  const access = useAccess();
  return <output>{`${access.role}:${access.gymId ?? 'none'}:${access.permissions.size}`}</output>;
}

beforeEach(() => {
  authState.profile = { id: 'account-a', role: 'owner', gymId: 'gym-a' };
  authState.activeScope = null;
  authState.isLoading = false;
  fetchMyAccessMock.mockReset();
});

describe('AccessProvider private-scope boundary', () => {
  it('publishes no gym permissions and performs no RPC without an exact active scope', async () => {
    render(<AccessProvider><Probe /></AccessProvider>);

    expect(screen.getByText('member:none:0')).toBeInTheDocument();
    await waitFor(() => expect(fetchMyAccessMock).not.toHaveBeenCalled());
  });

  it('ignores an access response for a different gym', async () => {
    authState.activeScope = {
      accountId: 'account-a',
      profileId: 'account-a',
      gymId: 'gym-b',
      role: 'member',
      branchId: null,
    };
    fetchMyAccessMock.mockResolvedValue({
      role: 'owner',
      gymId: 'gym-a',
      permissions: new Set(['roles:manage']),
      features: {},
    });

    render(<AccessProvider><Probe /></AccessProvider>);

    await waitFor(() => expect(fetchMyAccessMock).toHaveBeenCalled());
    expect(screen.getByText('member:gym-b:0')).toBeInTheDocument();
  });
});
