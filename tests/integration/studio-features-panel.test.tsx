import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GymPageStudio } from '@/components/admin/gym-studio/GymPageStudio';
import { accessFromRoleDefaults } from '@/lib/access';

const h = vi.hoisted(() => ({
  gymError: { current: null as null | { message: string } },
  saveFeatureFlags: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: h.gymError.current }) }) }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), list: () => Promise.resolve({ data: [], error: null }), remove: () => Promise.resolve({ error: null }), upload: () => Promise.resolve({ error: null }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  }),
}));

vi.mock('@/lib/access-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/access-data')>();
  return { ...actual, saveFeatureFlags: h.saveFeatureFlags };
});

vi.mock('sonner', () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));

const seed = {
  id: 'gym-1', name: 'Grove', code: 'grove-fitness', is_published: false, tagline: 'Strength', description: null,
  brand_color: '#2F7D5B', secondary_color: '#24302B', logo_url: null, cover_url: null, logo_path: null, cover_path: null,
  address: null, phone: null, operating_hours: null, amenities: null, social_links: null, team_members: null,
  pricing_packages: null, map_embed_url: null, directions: null,
  cover_focal: { x: 50, y: 50 }, section_visibility: { amenities: true, hours: true, contact: true },
};

function renderOwner() {
  return render(<GymPageStudio access={accessFromRoleDefaults('owner', 'gym-1')} initialGym={seed} />);
}

function openFeatures() {
  fireEvent.click(screen.getByText('Features').closest('button')!);
}

beforeEach(() => {
  h.gymError.current = null;
  h.saveFeatureFlags.mockReset().mockResolvedValue(undefined);
  h.toastError.mockReset();
  h.toastSuccess.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
});

describe('FeaturesGroup (§7.8)', () => {
  it('renders the §4 labels, effect lines and four coming-soon teasers', () => {
    renderOwner();
    openFeatures();
    expect(screen.getByText('Show gym feed')).toBeInTheDocument();
    expect(screen.getByText('Members see a live feed of check-ins and milestones.')).toBeInTheDocument();
    // The four teasers render a "Coming soon" chip and no switch.
    for (const label of ['Trainer bookings', 'Friends & Chat', 'Workout routines', 'Posts']) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: label })).not.toBeInTheDocument();
    }
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThanOrEqual(4);
  });

  it('is absent for a non-owner (no features:manage)', () => {
    render(<GymPageStudio access={accessFromRoleDefaults('admin', 'gym-1')} initialGym={seed} />);
    expect(screen.queryByText('Features')).not.toBeInTheDocument();
  });

  it('toggling a feature marks the Studio dirty and saves the flags', async () => {
    renderOwner();
    openFeatures();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Show gym feed' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(h.saveFeatureFlags).toHaveBeenCalled());
    const flags = h.saveFeatureFlags.mock.calls[0][2];
    expect(flags.member_feed).toBe(false);
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument());
  });

  it('partial-save failure stays dirty and names the failed half', async () => {
    h.gymError.current = { message: 'boom' }; // gym-row write fails; flags write succeeds
    renderOwner();
    openFeatures();
    fireEvent.click(screen.getByRole('switch', { name: 'Show gym feed' }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(h.toastError).toHaveBeenCalled());
    expect(h.toastError.mock.calls.some(([m]) => /page content didn't/i.test(String(m)))).toBe(true);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});
