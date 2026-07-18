import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/email', () => ({ sendOwnerClaimEmail: vi.fn(async () => ({ ok: true, messageId: 'test' })) }));

import {
  generateClaimToken, hashClaimToken, claimExpiresAt, buildClaimUrl, CLAIM_TOKEN_TTL_MS, deliverClaimInvite,
} from '@/lib/claim-invites';
import { sendOwnerClaimEmail } from '@/lib/email';

describe('generateClaimToken', () => {
  it('produces a long, URL-safe, unique token each call', () => {
    const a = generateClaimToken();
    const b = generateClaimToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('hashClaimToken', () => {
  it('is deterministic and never returns the raw token', () => {
    const token = generateClaimToken();
    const hash1 = hashClaimToken(token);
    const hash2 = hashClaimToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });

  it('produces different hashes for different tokens', () => {
    expect(hashClaimToken(generateClaimToken())).not.toBe(hashClaimToken(generateClaimToken()));
  });
});

describe('claimExpiresAt', () => {
  it('expires exactly 24 hours after the reference time', () => {
    const now = new Date('2026-07-17T00:00:00.000Z');
    expect(claimExpiresAt(now).toISOString()).toBe('2026-07-18T00:00:00.000Z');
    expect(CLAIM_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('buildClaimUrl', () => {
  it('joins the site URL and token under /claim/', () => {
    expect(buildClaimUrl('https://stren.app', 'abc123')).toBe('https://stren.app/claim/abc123');
    expect(buildClaimUrl('https://stren.app/', 'abc123')).toBe('https://stren.app/claim/abc123');
  });
});

describe('deliverClaimInvite', () => {
  it('dispatches to the email channel (the only implemented channel today)', async () => {
    const input = { to: 'owner@example.com', ownerName: 'Jane', gymName: 'Iron Fitness', claimLink: 'https://stren.app/claim/x', expiresAt: new Date().toISOString() };
    const result = await deliverClaimInvite(input);
    expect(sendOwnerClaimEmail).toHaveBeenCalledWith(input);
    expect(result.ok).toBe(true);
  });
});
