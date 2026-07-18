import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessClient } from '@/components/admin/AccessClient';
import { accessFromRoleDefaults } from '@/lib/access';

const h = vi.hoisted(() => ({
  listAccessPeople: vi.fn(),
  saveOverridesBatch: vi.fn(),
  fetchPersonOverrides: vi.fn(),
  addTeamPerson: vi.fn(),
  removeTeamPerson: vi.fn(),
  access: { current: null as ReturnType<typeof accessFromRoleDefaults> | null },
  auth: { current: null as Record<string, unknown> | null },
}));

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => h.auth.current,
}));
// The client owner gate reads `useAccess()`; default it to an owner (roles:manage).
vi.mock('@/lib/access-context', () => ({ useAccess: () => h.access.current }));
vi.mock('@/lib/access-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/access-data')>();
  return {
    ...actual,
    listAccessPeople: h.listAccessPeople,
    saveOverridesBatch: h.saveOverridesBatch,
    fetchPersonOverrides: h.fetchPersonOverrides,
    addTeamPerson: h.addTeamPerson,
    removeTeamPerson: h.removeTeamPerson,
  };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  h.access.current = accessFromRoleDefaults('owner', 'gym-1');
  h.auth.current = {
    profile: { name: 'Olivia Owner', email: 'owner@grove.co', gymId: 'gym-1', role: 'owner' },
    activeScope: { accountId: 'owner-1', profileId: 'owner-1', gymId: 'gym-1', role: 'owner' },
  };
  h.listAccessPeople.mockReset().mockResolvedValue([
    { userId: 'a1', name: 'Adam Admin', email: 'adam@grove.co', role: 'admin', overrides: [] },
    { userId: 's1', name: 'Sam Staff', email: 'sam@grove.co', role: 'staff', overrides: [] },
  ]);
  h.saveOverridesBatch.mockReset().mockResolvedValue(undefined);
  h.fetchPersonOverrides.mockReset().mockResolvedValue([]);
  h.addTeamPerson.mockReset().mockResolvedValue({
    person: { userId: 's2', name: 'Nina Staff', email: 'nina@grove.co', role: 'staff', overrides: [] },
    createdAccount: false,
    deliveryStatus: 'sent',
  });
  h.removeTeamPerson.mockReset().mockResolvedValue(undefined);
});

async function expandAdmin() {
  render(<AccessClient />);
  const adminRow = await screen.findByText('Adam Admin');
  fireEvent.click(adminRow.closest('button')!);
}

describe('People & access (§7.9)', () => {
  it('shows the owner row first with a full-access badge and no switches', async () => {
    render(<AccessClient />);
    expect(screen.getByText('Olivia Owner')).toBeInTheDocument();
    expect(screen.getByText('Owner — full access')).toBeInTheDocument();
    // No switches until an admin row is expanded.
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });

  it('expands an admin to exactly the 8 access switches with correct defaults', async () => {
    await expandAdmin();
    const switches = await screen.findAllByRole('switch');
    expect(switches).toHaveLength(8);
    expect(screen.getByRole('switch', { name: 'Can manage members' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Can see money numbers (dashboard & reports)' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Can open & edit the Gym Page studio' })).not.toBeChecked();
  });

  it('flipping a multi-key switch off writes one atomic batch for every mapped key', async () => {
    await expandAdmin();
    fireEvent.click(await screen.findByRole('switch', { name: 'Can see money numbers (dashboard & reports)' }));
    await waitFor(() => expect(h.saveOverridesBatch).toHaveBeenCalledTimes(1));
    const [, args] = h.saveOverridesBatch.mock.calls[0];
    expect(args.clears).toEqual([]);
    const perms = args.grants.map((g: { permission: string }) => g.permission).sort();
    expect(perms).toEqual(['dashboard:finance:view', 'reports:finance:view']);
    for (const g of args.grants) expect(g.granted).toBe(false);
  });

  it('flipping back to the default clears the override rows in one batch', async () => {
    await expandAdmin();
    const moneySwitch = await screen.findByRole('switch', { name: 'Can see money numbers (dashboard & reports)' });
    fireEvent.click(moneySwitch); // off → grants batch
    await waitFor(() => expect(h.saveOverridesBatch).toHaveBeenCalledTimes(1));
    h.saveOverridesBatch.mockClear();
    fireEvent.click(moneySwitch); // back to default → clears batch
    await waitFor(() => expect(h.saveOverridesBatch).toHaveBeenCalledTimes(1));
    const [, args] = h.saveOverridesBatch.mock.calls[0];
    expect(args.grants).toEqual([]);
    expect([...args.clears].sort()).toEqual(['dashboard:finance:view', 'reports:finance:view']);
  });

  it('resyncs from the DB truth (not the pre-flip state) when a batch write fails', async () => {
    h.saveOverridesBatch.mockRejectedValueOnce(new Error('half-applied'));
    // Server half-applied: only one of the two money keys was actually revoked.
    h.fetchPersonOverrides.mockResolvedValueOnce([{ permission: 'dashboard:finance:view', granted: false }]);
    await expandAdmin();
    const moneySwitch = await screen.findByRole('switch', { name: 'Can see money numbers (dashboard & reports)' });
    expect(moneySwitch).toBeChecked(); // admin default = both finance keys on
    fireEvent.click(moneySwitch);
    await waitFor(() => expect(h.fetchPersonOverrides).toHaveBeenCalledTimes(1));
    // The money switch needs BOTH keys — with one revoked in the DB it stays off,
    // reflecting the refetched truth rather than a full revert (which would be on).
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Can see money numbers (dashboard & reports)' })).not.toBeChecked(),
    );
  });

  it('lets the owner customise a staff member’s access too', async () => {
    render(<AccessClient />);
    const staff = await screen.findByText('Sam Staff');
    fireEvent.click(staff.closest('button')!);
    expect(await screen.findByRole('switch', { name: 'Can manage members' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove staff/i })).toBeInTheDocument();
  });

  it('loads the active gym team even while the legacy profile gym field is unavailable after sign-in', async () => {
    h.auth.current = {
      profile: { name: 'Olivia Owner', email: 'owner@grove.co', gymId: null, role: 'member' },
      activeScope: { accountId: 'owner-1', profileId: 'owner-1', gymId: 'gym-1', role: 'owner' },
    };

    render(<AccessClient />);

    expect(await screen.findByText('Adam Admin')).toBeInTheDocument();
    expect(h.listAccessPeople).toHaveBeenCalledWith(expect.anything(), 'gym-1');
  });

  it('shows a retryable error instead of claiming the team is empty when the team query fails', async () => {
    h.listAccessPeople.mockRejectedValueOnce(new Error('query failed')).mockResolvedValueOnce([
      { userId: 'a1', name: 'Adam Admin', email: 'adam@grove.co', role: 'admin', overrides: [] },
    ]);

    const user = userEvent.setup();
    render(<AccessClient />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your team. Please try again.');
    expect(screen.queryByText('No admin or staff accounts yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^retry$/i }));
    expect(await screen.findByText('Adam Admin')).toBeInTheDocument();
  });

  it('gives the owner a clear way to add a teammate', async () => {
    render(<AccessClient />);
    fireEvent.click(await screen.findByRole('button', { name: /add teammate/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /teammate name/i }), { target: { value: 'Nina Staff' } });
    fireEvent.change(screen.getByRole('textbox', { name: /teammate email/i }), { target: { value: 'nina@grove.co' } });
    fireEvent.click(screen.getByRole('button', { name: /^add to team$/i }));
    await waitFor(() => expect(h.addTeamPerson).toHaveBeenCalledWith({ name: 'Nina Staff', email: 'nina@grove.co', role: 'staff' }));
    expect(await screen.findByText('Nina Staff')).toBeInTheDocument();
  });

  it('portals the add-teammate dialog to the document viewport', async () => {
    render(<AccessClient />);
    fireEvent.click(await screen.findByRole('button', { name: /add teammate/i }));

    const dialog = screen.getByRole('dialog', { name: /add teammate/i });
    const overlay = dialog.closest('[data-viewport-overlay]');
    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement).toBe(document.body);
  });

  it('renders the owner-only state for a viewer without roles:manage', async () => {
    h.access.current = accessFromRoleDefaults('admin', 'gym-1'); // admin lacks roles:manage
    render(<AccessClient />);
    expect(screen.getByText('Only the owner can manage people & access.')).toBeInTheDocument();
    // No team list / switches leak through the courtesy gate.
    expect(screen.queryByText('Your team')).not.toBeInTheDocument();
    expect(h.listAccessPeople).not.toHaveBeenCalled();
  });
});
