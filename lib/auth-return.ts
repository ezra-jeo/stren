const CLAIM_PATH = /^\/claim\/[A-Za-z0-9_-]+$/;

/**
 * Only the public claim page may be resumed after authentication. Returning a
 * path instead of accepting a URL keeps the auth surface closed to redirects.
 */
export function sanitizePostAuthReturn(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;

  let parsed: URL;
  try {
    parsed = new URL(value, 'https://stren.invalid');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://stren.invalid' || parsed.search || parsed.hash) return null;
  return CLAIM_PATH.test(parsed.pathname) ? parsed.pathname : null;
}
