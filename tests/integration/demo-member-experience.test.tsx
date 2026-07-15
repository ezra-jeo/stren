import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberHomeClient } from '@/components/member/MemberHomeClient';
import { MemberShell } from '@/components/member/MemberShell';
import { DemoProfile } from '@/components/member/demo/DemoProfile';
import { DEMO_MEMBER_DATA } from '@/lib/demo-member';

const pushMock = vi.fn();
const replaceMock = vi.fn();
let pathname = '/member/demo';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/member-notifications-panel', () => ({ MemberNotificationsPanel: () => null }));
vi.mock('@/components/gyms/GymSwitcher', () => ({ GymSwitcher: () => <button type="button">Real gym switcher</button> }));
vi.mock('@/components/member/FirstLoginPasswordSetup', () => ({ FirstLoginPasswordSetup: () => null }));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    profile: {
      id: 'member-1',
      name: 'Bon Aquino',
      email: 'bon@example.com',
      contactNumber: null,
      avatarUrl: 'https://images.example.com/bon.jpg',
      qrCode: 'real-secret-member-qr',
      createdAt: '2026-03-01T00:00:00.000Z',
    },
    isLoading: false,
  }),
}));

beforeEach(() => {
  pathname = '/member/demo';
  pushMock.mockReset();
  replaceMock.mockReset();
});

describe('route-isolated member Demo Mode', () => {
  it('uses the real member shell with a fixed demo gym and persistent exit banner', async () => {
    const user = userEvent.setup();
    render(<MemberShell gymBranding={null} hasServerUser demoMode>content</MemberShell>);

    expect(screen.getAllByText('Stren Demo Gym').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sample workspace').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /real gym switcher/i })).not.toBeInTheDocument();
    expect(screen.getByText(/demo mode · sample data/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /exit demo/i }));
    expect(replaceMock).toHaveBeenCalledWith('/gyms');
  });

  it('renders sample Home data with real identity and blocks check-in', async () => {
    const user = userEvent.setup();
    render(<MemberHomeClient data={{ ...DEMO_MEMBER_DATA.home, memberName: 'Bon Aquino' }} demoMode />);

    expect(screen.getByRole('heading', { name: /bon\./i })).toBeInTheDocument();
    expect(screen.getByText('3 workouts')).toBeInTheDocument();
    expect(screen.getAllByText(/12 people/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /^check in$/i }));
    expect(screen.getByRole('dialog', { name: /preview only/i })).toHaveTextContent('Nothing here affects your account');
    expect(screen.queryByAltText(/member qr code/i)).not.toBeInTheDocument();
  });

  it('renders a complete demo-safe Profile with real identity and an invalid sample QR', async () => {
    const user = userEvent.setup();
    render(<DemoProfile />);

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getAllByText('Bon Aquino').length).toBeGreaterThan(0);
    expect(screen.getAllByText('bon@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText('Demo All Access')).toBeInTheDocument();
    expect(screen.getByText('Active (Demo)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /unusable demo qr code/i })).toHaveAttribute('data-demo-qr', 'invalid');
    expect(document.body.textContent).not.toContain('real-secret-member-qr');

    await user.click(screen.getByRole('button', { name: /edit personal information/i }));
    expect(screen.getByRole('dialog', { name: /preview only/i })).toBeInTheDocument();
  });

  it('keeps demo navigation inside the demo route namespace', () => {
    render(<MemberShell gymBranding={null} hasServerUser demoMode>content</MemberShell>);

    expect(screen.getAllByRole('link', { name: /home/i })[0]).toHaveAttribute('href', '/member/demo');
    expect(screen.getAllByRole('link', { name: /profile/i })[0]).toHaveAttribute('href', '/member/demo/profile');
    expect(screen.getAllByRole('link', { name: /settings/i })[0]).toHaveAttribute('href', '/member/demo/settings');
  });
});
