import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LandingHero } from '@/components/landing/landing-hero';
import { LandingNav } from '@/components/landing/landing-nav';

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }));

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
});
