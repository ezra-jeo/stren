import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const publicGym = {
  name: 'Grove Fitness',
  code: 'grove-fitness',
  brand_color: '#2F7D5B',
  secondary_color: '#24302B',
  is_published: true,
  features: {},
};

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));
vi.mock('@/lib/gym-public', () => ({ getGymPublicByCode: vi.fn(async () => ({ code: publicGym.code, data: publicGym })) }));
vi.mock('@/components/gym/GymTopNav', () => ({ GymTopNav: () => <nav>Gym navigation</nav> }));
vi.mock('@/components/gym/GymPoweredBy', () => ({ GymPoweredBy: () => <footer>Powered by Stren</footer> }));

import GymLayout from '@/app/gym/[code]/layout';

describe('public gym theme boundary', () => {
  it('scopes the gym colors to its own page instead of relying on a global :root override', async () => {
    render(await GymLayout({ children: <p>Public gym content</p>, params: { code: publicGym.code } }));

    const theme = screen.getByTestId('gym-theme');
    expect(theme).toHaveStyle({ '--color-primary': '#2F7D5B', '--color-secondary': '#24302B' });
    expect(theme).toHaveTextContent('Public gym content');
  });
});
