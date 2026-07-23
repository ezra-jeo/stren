import { createHash, randomBytes } from 'node:crypto';
import { sendOwnerClaimEmail } from '@/lib/email';

export const CLAIM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Raw token — sent once through the email-delivery boundary. Never stored or returned by an API. */
export function generateClaimToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored (gym_claim_invites.token_hash) and compared server-side. */
export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function claimExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + CLAIM_TOKEN_TTL_MS);
}

export function buildClaimUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/claim/${token}`;
}

export interface DeliverClaimInviteInput {
  to: string;
  ownerName: string;
  gymName: string;
  claimLink: string;
  expiresAt: string;
}

/**
 * Single dispatch point for claim-invite delivery. Email is the only
 * implemented channel today; SMS can be added here later without touching
 * the provisioning route that calls this.
 */
export async function deliverClaimInvite(input: DeliverClaimInviteInput) {
  return sendOwnerClaimEmail(input);
}
