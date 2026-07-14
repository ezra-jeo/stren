import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadingScreen, PageSkeleton, PrivacyCurtain } from '@/components/ui/loading-screen';
import { AuthSurfaceSkeleton } from '@/components/auth/AuthSurfaceSkeleton';
import AdminRouteError from '@/app/admin/error';
import MemberRouteError from '@/app/member/error';

afterEach(() => vi.useRealTimers());

describe('Stren loading experience', () => {
  it('uses the supplied Stren mark and one calm bootstrap announcement', () => {
    render(<LoadingScreen detail="Preparing your gym" />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Setting things up for you');
    expect(status).toHaveTextContent('Preparing your gym');
    expect(status.querySelectorAll('img[src="/stren-logo.svg"]')).toHaveLength(2);
    expect(status).not.toHaveTextContent(/^S$/);
  });

  it('reserves layout immediately but delays skeleton paint to avoid a one-frame flash', async () => {
    vi.useFakeTimers();
    const { container } = render(<PageSkeleton rows={2} height={80} delayMs={100} />);

    expect(container.querySelector('[data-skeleton-visible="true"]')).toBeNull();
    expect(container.querySelector('[data-skeleton-reserved="true"]')).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(container.querySelector('[data-skeleton-visible="true"]')).toBeInTheDocument();
  });

  it('makes private content inert and moves focus while the privacy curtain is active', async () => {
    const { rerender } = render(<button>Private action</button>);
    const privateAction = screen.getByRole('button', { name: 'Private action' });
    privateAction.focus();

    rerender(<><button>Private action</button><PrivacyCurtain message="Switching gyms…" /></>);

    const curtain = await screen.findByRole('dialog', { name: 'Switching gyms…' });
    expect(curtain).toHaveFocus();
    expect(privateAction.closest('div')).toHaveAttribute('inert');
    expect(curtain.querySelectorAll('img[src="/stren-logo.svg"]')).toHaveLength(2);
    expect(curtain.querySelector('.stren-bootstrap-progress')).toBeInTheDocument();
  });

  it('announces the auth route fallback', () => {
    render(<AuthSurfaceSkeleton />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading sign in/i);
  });

  it('announces and focuses embedded route failures', () => {
    const { rerender } = render(<AdminRouteError error={new Error('failed')} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveFocus();

    rerender(<MemberRouteError error={new Error('failed')} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
