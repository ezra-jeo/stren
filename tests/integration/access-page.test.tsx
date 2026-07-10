import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AccessClient } from '@/components/admin/AccessClient';

const h = vi.hoisted(() => ({ listAccessPeople: vi.fn(), saveOverride: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ profile: { name: 'Olivia Owner', email: 'owner@grove.co', gymId: 'gym-1', role: 'owner' } }),
}));
vi.mock('@/lib/access-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/access-data')>();
  return { ...actual, listAccessPeople: h.listAccessPeople, saveOverride: h.saveOverride };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  h.listAccessPeople.mockReset().mockResolvedValue([
    { userId: 'a1', name: 'Adam Admin', email: 'adam@grove.co', role: 'admin', overrides: [] },
    { userId: 's1', name: 'Sam Staff', email: 'sam@grove.co', role: 'staff', overrides: [] },
  ]);
  h.saveOverride.mockReset().mockResolvedValue(undefined);
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

  it('flipping a multi-key switch off writes an override for every mapped key', async () => {
    await expandAdmin();
    fireEvent.click(await screen.findByRole('switch', { name: 'Can see money numbers (dashboard & reports)' }));
    await waitFor(() => expect(h.saveOverride).toHaveBeenCalledTimes(2));
    const perms = h.saveOverride.mock.calls.map(([, args]) => args.permission).sort();
    expect(perms).toEqual(['dashboard:finance:view', 'reports:finance:view']);
    for (const [, args] of h.saveOverride.mock.calls) expect(args.granted).toBe(false);
  });

  it('flipping back to the default deletes the override rows (granted null)', async () => {
    await expandAdmin();
    const moneySwitch = await screen.findByRole('switch', { name: 'Can see money numbers (dashboard & reports)' });
    fireEvent.click(moneySwitch); // off → override rows
    await waitFor(() => expect(h.saveOverride).toHaveBeenCalledTimes(2));
    h.saveOverride.mockClear();
    fireEvent.click(moneySwitch); // back to default → delete rows
    await waitFor(() => expect(h.saveOverride).toHaveBeenCalledTimes(2));
    for (const [, args] of h.saveOverride.mock.calls) expect(args.granted).toBeNull();
  });

  it('staff rows are static with a caption and no switches', async () => {
    render(<AccessClient />);
    expect(await screen.findByText('Sam Staff')).toBeInTheDocument();
    expect(screen.getByText('Staff can use the kiosk and look up members.')).toBeInTheDocument();
    // Sam's row is not an expandable button.
    expect(screen.getByText('Sam Staff').closest('button')).toBeNull();
  });
});
