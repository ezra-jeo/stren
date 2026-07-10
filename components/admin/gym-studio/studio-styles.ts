import type { CSSProperties } from 'react';

/** Shared field styling for the Studio control rail (matches the mockup with app tokens). */
export const fieldClass = 'w-full rounded-[9px] border px-3 py-2.5 text-[13.5px] outline-none focus:ring-2';

export const fieldStyle: CSSProperties = {
  borderColor: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  backgroundColor: 'var(--color-white)',
};

export const compactFieldClass = 'w-full rounded-lg border px-2.5 py-2 text-[12.5px] outline-none focus:ring-2';

export const labelStyle: CSSProperties = { color: 'var(--color-text-secondary)' };
