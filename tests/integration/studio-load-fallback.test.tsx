import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GymPageStudio } from '@/components/admin/gym-studio/GymPageStudio';
import { accessFromRoleDefaults } from '@/lib/access';

/**
 * Fix 1 — three-tier load resilience. When the full select (which includes the
 * migration-017 `cover_focal`/`section_visibility` columns) errors because the DB
 * is behind the app, the Studio retries WITHOUT those two columns but WITH
 * `is_published` + `secondary_color`, so a published gym still reads "Live" and the
 * save payload omits the columns that don't exist.
 */

const h = vi.hoisted(() => ({
  updatePayload: { current: null as Record<string, unknown> | null },
}));

const gymRow = {
  id: 'gym-1', name: 'Grove', code: 'grove-fitness', is_published: true, tagline: 'Strength', description: null,
  brand_color: '#2F7D5B', secondary_color: '#24302B', logo_url: null, cover_url: null, logo_path: null, cover_path: null,
  address: null, phone: null, operating_hours: null, amenities: null, social_links: null, team_members: null,
  pricing_packages: null, map_embed_url: null, directions: null,
};

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'gyms') {
        return {
          select: (columns: string) => ({
            eq: () => ({
              maybeSingle: () =>
                // Tier (a) (full select) fails; tier (b) (no Studio-meta) succeeds.
                columns.includes('cover_focal')
                  ? Promise.resolve({ data: null, error: { message: 'column gyms.cover_focal does not exist' } })
                  : Promise.resolve({ data: gymRow, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            h.updatePayload.current = payload;
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    },
    storage: {
      from: () => ({
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        list: () => Promise.resolve({ data: [], error: null }),
        remove: () => Promise.resolve({ error: null }),
        upload: () => Promise.resolve({ error: null }),
      }),
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  }),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ profile: { name: 'Owner', email: 'o@grove.co', gymId: 'gym-1', role: 'owner' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  h.updatePayload.current = null;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
});

describe('Studio load fallback (Fix 1 — tier-b: DB behind the app)', () => {
  it('keeps a published gym "Live" when the Studio-meta columns are missing', async () => {
    render(<GymPageStudio access={accessFromRoleDefaults('owner', 'gym-1')} />);
    // is_published survived the fallback → status pill is "Live", not "Hidden".
    expect(await screen.findByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('omits cover_focal/section_visibility from the save payload but keeps is_published + secondary_color', async () => {
    render(<GymPageStudio access={accessFromRoleDefaults('owner', 'gym-1')} />);
    // Unpublish triggers a save with a known publish state.
    const unpublish = await screen.findByRole('button', { name: /^unpublish$/i });
    fireEvent.click(unpublish);

    await waitFor(() => expect(h.updatePayload.current).not.toBeNull());
    const payload = h.updatePayload.current!;
    expect('cover_focal' in payload).toBe(false);
    expect('section_visibility' in payload).toBe(false);
    expect('is_published' in payload).toBe(true);
    expect('secondary_color' in payload).toBe(true);
  });
});
