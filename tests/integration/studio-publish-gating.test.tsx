import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GymPageStudio } from '@/components/admin/gym-studio/GymPageStudio';
import { accessFromRoleDefaults } from '@/lib/access';

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), list: () => Promise.resolve({ data: [], error: null }), remove: () => Promise.resolve({ error: null }), upload: () => Promise.resolve({ error: null }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  }),
}));

const seed = {
  id: 'gym-1', name: 'Grove', code: 'grove-fitness', is_published: false, tagline: 'Strength', description: null,
  brand_color: '#2F7D5B', secondary_color: '#24302B', logo_url: null, cover_url: null, logo_path: null, cover_path: null,
  address: null, phone: null, operating_hours: null, amenities: null, social_links: null, team_members: null,
  pricing_packages: null, map_embed_url: null, directions: null,
  cover_focal: { x: 50, y: 50 }, section_visibility: { amenities: true, hours: true, contact: true },
};

describe('Studio publish gating (§7.3.1)', () => {
  it('owner sees a Publish button', () => {
    render(<GymPageStudio access={accessFromRoleDefaults('owner', 'gym-1')} initialGym={seed} />);
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeInTheDocument();
    expect(screen.queryByText('Only the owner can publish')).not.toBeInTheDocument();
  });

  it('an admin without gym_page:publish sees the caption, not a button', () => {
    render(<GymPageStudio access={accessFromRoleDefaults('admin', 'gym-1')} initialGym={seed} />);
    expect(screen.getByText('Only the owner can publish')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^unpublish$/i })).not.toBeInTheDocument();
  });
});
