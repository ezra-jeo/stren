import { describe, expect, it } from 'vitest';
import { buildAuthConfirmationUrl } from '@/lib/auth-email-link';

describe('first-party auth email links', () => {
  it('routes recovery tokens through a non-consuming confirmation page', () => {
    const url = new URL(buildAuthConfirmationUrl({
      siteUrl: 'https://stren.app/',
      tokenHash: 'secret-token',
      type: 'recovery',
      next: '/reset-password',
    }));

    expect(url.origin).toBe('https://stren.app');
    expect(url.pathname).toBe('/auth/confirm');
    expect(url.searchParams.get('token_hash')).toBe('secret-token');
    expect(url.searchParams.get('type')).toBe('recovery');
    expect(url.searchParams.get('next')).toBe('/reset-password');
  });

  it('keeps the deployment source directory out of public confirmation URLs', () => {
    const url = new URL(buildAuthConfirmationUrl({
      siteUrl: 'https://stren.netlify.app/app',
      tokenHash: 'secret-token',
      type: 'recovery',
      next: '/reset-password',
    }));

    expect(url.pathname).toBe('/auth/confirm');
  });
});
