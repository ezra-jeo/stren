import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingNav } from '@/components/landing/landing-nav';

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }));
let authValue: { user: { id: string } | null; isLoading: boolean };
vi.mock('@/lib/auth-context', () => ({ useAuth: () => authValue }));

beforeEach(() => {
  authValue = { user: null, isLoading: false };
});

describe('landing authentication and owner calls to action', () => {
  it('routes people to the shared auth modes and owners to assisted onboarding', () => {
    const { container } = render(<LandingHero />);
    const hero = within(container);
    expect(hero.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/auth?mode=signin');
    expect(hero.getByRole('link', { name: /^create account$/i })).toHaveAttribute('href', '/auth?mode=signup');
    expect(hero.getByRole('link', { name: /^for gym owners$/i })).toHaveAttribute('href', '/for-gym-owners');
    expect(hero.queryByText(/register gym/i)).not.toBeInTheDocument();
  });

  it('uses the same destinations in the navigation drawer', async () => {
    const user = userEvent.setup();
    render(<LandingNav />);
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/auth?mode=signin');
    expect(within(drawer).getByRole('link', { name: /^create account$/i })).toHaveAttribute('href', '/auth?mode=signup');
    expect(within(drawer).getByRole('link', { name: /bring stren to your gym/i })).toHaveAttribute('href', '/for-gym-owners');
    expect(within(drawer).queryByText(/register gym/i)).not.toBeInTheDocument();
  });

  it('replaces account-creation calls to action for an authenticated account', async () => {
    const user = userEvent.setup();
    authValue = { user: { id: 'u1' }, isLoading: false };
    const { rerender } = render(<LandingHero />);
    expect(screen.queryByRole('link', { name: /^create account$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open stren/i })).toHaveAttribute('href', '/gyms');

    rerender(<LandingNav />);
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).queryByRole('link', { name: /^create account$/i })).not.toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: /open stren/i })).toHaveAttribute('href', '/gyms');
  });
});
