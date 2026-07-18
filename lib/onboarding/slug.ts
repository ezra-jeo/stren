// Mirrors the slug rule enforced by supabase/migrations/020_platform_admin_gym_creation.sql
// create_gym() and 027_assisted_onboarding.sql provision_gym_workspace() — client-side
// validation only mirrors the server; the server RPC is the real enforcement boundary.

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,31}$/;

export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'auth', 'gym', 'gyms', 'kiosk', 'login', 'member', 'reset-password',
  'signup', 'stren', 'www', 'support', 'help', 'privacy', 'terms',
]);

/** Best-effort slug from a gym name — normalized in one shot (auto-derivation, not live typing). */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * Live-typing normalization for the slug field itself. Unlike slugify(), this
 * never strips a trailing hyphen — doing so live would make it impossible to
 * type a hyphen followed by more characters (each keystroke would re-derive
 * from an already-trimmed value). Trailing/leading hyphens are instead
 * rejected by validateSlugFormat() until the operator finishes typing.
 */
export function sanitizeSlugInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 32);
}

export interface SlugValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateSlugFormat(slug: string): SlugValidationResult {
  if (!SLUG_PATTERN.test(slug) || slug.includes('--') || slug.endsWith('-')) {
    return { valid: false, reason: 'Use 3-32 lowercase letters, numbers, or single hyphens.' };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { valid: false, reason: 'That URL is reserved.' };
  }
  return { valid: true };
}
