import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from 'lucide-react';

const prefetchMock = vi.fn();
let pathname = '/member';
let search = '';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ prefetch: prefetchMock }),
}));

vi.mock('@/lib/navigation-performance', () => ({ browserAllowsPrefetch: () => true }));

import { NavLinkItem } from '@/components/layout/nav-link';
import { IntentLink } from '@/components/layout/intent-link';
import { RouteContent } from '@/components/layout/route-content';

beforeEach(() => {
  pathname = '/member';
  search = '';
  prefetchMock.mockReset();
});

describe('authenticated navigation feedback', () => {
  it('prefetches on intent and marks the destination active immediately on press', () => {
    const { rerender } = render(
      <NavLinkItem href="/member/feed" label="Feed" icon={Home} active={false} prefetch />,
    );
    const link = screen.getByRole('link', { name: /feed/i });

    fireEvent.pointerEnter(link);
    expect(prefetchMock).toHaveBeenCalledWith('/member/feed');

    fireEvent.click(link);
    expect(link).not.toHaveAttribute('aria-current');
    expect(link).toHaveAttribute('data-navigation-pending', 'true');

    pathname = '/member/feed';
    rerender(<NavLinkItem href="/member/feed" label="Feed" icon={Home} active prefetch />);
    expect(screen.getByRole('link', { name: /feed/i })).not.toHaveAttribute('data-navigation-pending');
  });

  it('does not enter a stuck pending state for modified or cancelled navigation', () => {
    const cancel = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    const { rerender } = render(
      <NavLinkItem href="/member/feed" label="Feed" icon={Home} active={false} onClick={cancel} />,
    );
    let link = screen.getByRole('link', { name: /feed/i });

    fireEvent.click(link, { ctrlKey: true });
    expect(link).not.toHaveAttribute('data-navigation-pending');

    fireEvent.click(link);
    expect(link).not.toHaveAttribute('data-navigation-pending');

    rerender(<NavLinkItem href="/member/feed" label="Feed" icon={Home} active={false} />);
    link = screen.getByRole('link', { name: /feed/i });
    fireEvent.click(link);
    expect(link).toHaveAttribute('data-navigation-pending', 'true');
  });

  it('prefetches the complete URL object and starts public transitions only for uncancelled primary clicks', () => {
    const cancel = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    const { rerender } = render(
      <IntentLink
        href={{ pathname: '/auth', query: { mode: 'signup', gym: 'iron' }, hash: 'form' }}
        transitionKind="public-auth"
        onClick={cancel}
      >
        Join
      </IntentLink>,
    );
    let link = screen.getByRole('link', { name: 'Join' });

    fireEvent.pointerEnter(link);
    expect(prefetchMock).toHaveBeenCalledWith('/auth?mode=signup&gym=iron#form');
    fireEvent.click(link);
    expect(document.body).not.toHaveAttribute('data-navigation-kind');

    rerender(<IntentLink href="/auth?mode=signin" transitionKind="public-auth">Sign in</IntentLink>);
    link = screen.getByRole('link', { name: 'Sign in' });
    fireEvent.click(link, { metaKey: true });
    expect(document.body).not.toHaveAttribute('data-navigation-kind');
    fireEvent.click(link);
    expect(document.body).toHaveAttribute('data-navigation-kind', 'public-auth');
  });

  it('focuses a named content region when path or query content changes', async () => {
    const { rerender } = render(<RouteContent><h1>Member home</h1></RouteContent>);
    const initial = screen.getByRole('region', { name: 'Page content' });
    expect(initial).not.toHaveFocus();

    search = 'scope=gym-b';
    rerender(<RouteContent><h1>Member home</h1></RouteContent>);

    await waitFor(() => expect(screen.getByRole('region', { name: 'Page content' })).toHaveFocus());
  });
});
