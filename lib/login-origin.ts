export function isValidLoginOrigin(candidate: string | null | undefined): boolean {
  if (!candidate) return false
  if (candidate === "/login") return true

  // Accepts:
  // /gym/{code}/login
  // /gym/{code}/login?from=select
  // /gym/{code}/login?from=landing
  const m = candidate.match(/^\/gym\/[^/]+\/login(?:\?from=(select|landing))?$/)
  return !!m
}

export function normalizeLoginOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  return isValidLoginOrigin(candidate) ? candidate : null
}

export default { isValidLoginOrigin, normalizeLoginOrigin }
