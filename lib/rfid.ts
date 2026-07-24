const UID_HEX = /^[0-9A-F]{8,32}$/;

/** Canonical reader UID: uppercase hexadecimal, separators removed. */
export function normalizeRfidUid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[\s:-]/g, '').toUpperCase();
  return UID_HEX.test(normalized) ? normalized : null;
}

/** Display-only card reference. Never return or persist a raw UID. */
export function maskRfidUid(uid: string): string {
  return `•••• ${uid.slice(-4)}`;
}

export function initialsForName(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('') || 'M';
}
