export function resolveSignOutTargetPath(params: {
  storedLoginOriginPath: string | null
  gymLoginPath: string | null
  fallbackPath?: string
}): string {
  const { storedLoginOriginPath, gymLoginPath, fallbackPath = '/login' } = params
  if (storedLoginOriginPath) return storedLoginOriginPath
  if (gymLoginPath) return gymLoginPath
  return fallbackPath
}
