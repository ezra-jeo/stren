import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GymLandingPreview, type GymPreviewData } from '@/components/gym/GymLandingPreview';

const baseGym: GymPreviewData = {
  name: 'Grove Fitness',
  code: 'grove-fitness',
  tagline: 'Strength & community',
  description: 'A boutique strength studio.',
  address: '48 Ruckers Lane',
  phone: '(03) 9482 1130',
  logoUrl: 'https://cdn.example/logo.jpg',
  coverUrl: 'https://cdn.example/cover.jpg',
  brandColor: '#2F7D5B',
  secondaryColor: '#24302B',
  operatingHours: { Monday: '5:00 AM – 10:00 PM' },
  amenities: ['Sauna', 'Squat racks'],
  socialLinks: { instagram: 'https://instagram.com/grove' },
  teamMembers: [{ name: 'Maya Ellis', role: 'Head Coach' }],
  pricingPackages: [{ name: 'Full Access', price: '$39', duration: 'per week', features: ['24/7 access'], is_featured: true }],
  mapEmbedUrl: null,
  directions: 'Two minutes from the station.',
  memberCount: 214,
  coverFocal: { x: 50, y: 50 },
  sectionVisibility: { amenities: true, hours: true, contact: true },
};

describe('GymLandingPreview — home view (extraction parity guard)', () => {
  it('renders the gym identity and both hero CTAs', () => {
    render(<GymLandingPreview gym={baseGym} view="home" interactive />);
    expect(screen.getAllByText('Grove Fitness').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Strength & community').length).toBeGreaterThan(0);
    // Mobile hero CTA + desktop hero CTA both present in the responsive markup.
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /join grove fitness/i }).length).toBeGreaterThan(0);
  });

  it('applies the focal point as object-position on the cover (default = centre)', () => {
    render(<GymLandingPreview gym={baseGym} view="home" interactive />);
    const covers = screen.getAllByAltText('Grove Fitness');
    expect(covers[0]).toHaveStyle({ objectPosition: '50% 50%' });
  });

  it('honors a non-centre focal point', () => {
    render(<GymLandingPreview gym={{ ...baseGym, coverFocal: { x: 62, y: 38 } }} view="home" interactive />);
    const covers = screen.getAllByAltText('Grove Fitness');
    expect(covers[0]).toHaveStyle({ objectPosition: '62% 38%' });
  });

  it('hides a section when section visibility is off', () => {
    const { rerender } = render(<GymLandingPreview gym={baseGym} view="home" interactive />);
    expect(screen.getByText('Amenities')).toBeInTheDocument();
    rerender(
      <GymLandingPreview
        gym={{ ...baseGym, sectionVisibility: { amenities: false, hours: true, contact: true } }}
        view="home"
        interactive
      />,
    );
    expect(screen.queryByText('Amenities')).not.toBeInTheDocument();
  });

  it('forces a single device branch in the Studio', () => {
    render(<GymLandingPreview gym={baseGym} view="home" device="mobile" interactive={false} />);
    // Mobile hero uses "Create Account"; the desktop-only "Join" CTA is absent.
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join grove fitness/i })).not.toBeInTheDocument();
  });
});

describe('GymLandingPreview — subpage views', () => {
  it('renders the pricing table', () => {
    render(<GymLandingPreview gym={baseGym} view="pricing" interactive />);
    expect(screen.getByText('Pricing')).toBeInTheDocument();
    expect(screen.getByText('Full Access')).toBeInTheDocument();
    expect(screen.getByText('Most Popular')).toBeInTheDocument();
  });

  it('renders the contact team block and hides it when showTeam is false', () => {
    const { rerender } = render(<GymLandingPreview gym={baseGym} view="contact" interactive showTeam />);
    expect(screen.getByText('Meet the Team')).toBeInTheDocument();
    rerender(<GymLandingPreview gym={baseGym} view="contact" interactive showTeam={false} />);
    expect(screen.queryByText('Meet the Team')).not.toBeInTheDocument();
  });

  it('renders the §7.8 hidden-page placeholder when pageHidden', () => {
    render(<GymLandingPreview gym={baseGym} view="pricing" interactive pageHidden />);
    expect(screen.getByText('This page is hidden')).toBeInTheDocument();
    expect(screen.getByText(/won't see Pricing in the menu/i)).toBeInTheDocument();
  });

  it('shows the active-members chip on Join only when the count is positive', () => {
    const { rerender } = render(<GymLandingPreview gym={baseGym} view="join" interactive={false} />);
    expect(screen.getByText('214 active members')).toBeInTheDocument();
    // Hidden at zero so the Studio preview never reads "0 active members".
    rerender(<GymLandingPreview gym={{ ...baseGym, memberCount: 0 }} view="join" interactive={false} />);
    expect(screen.queryByText(/active members/i)).not.toBeInTheDocument();
  });
});
