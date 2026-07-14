export interface NetworkInformationHint {
  saveData?: boolean;
  effectiveType?: string;
}

export function shouldPrefetchNavigation(
  connection: NetworkInformationHint | undefined,
  online: boolean,
): boolean {
  if (!online || connection?.saveData) return false;
  return connection?.effectiveType !== 'slow-2g' && connection?.effectiveType !== '2g';
}

export function browserAllowsPrefetch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationHint }).connection;
  return shouldPrefetchNavigation(connection, navigator.onLine !== false);
}
