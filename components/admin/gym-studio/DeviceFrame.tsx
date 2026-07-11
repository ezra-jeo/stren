'use client';

/**
 * Preview device chrome (§7.3.6): browser frame (desktop) or phone bezel (mobile),
 * each with its own scrollable viewport.
 */
export function DeviceFrame({
  device,
  host,
  code,
  children,
}: {
  device: 'desktop' | 'mobile';
  host: string;
  code: string;
  children: React.ReactNode;
}) {
  if (device === 'mobile') {
    return (
      <div className="flex-none rounded-[34px] p-2.5 shadow-2xl" style={{ width: 320, backgroundColor: '#1a1a1a' }}>
        <div className="overflow-hidden rounded-[26px]" style={{ height: 660, backgroundColor: 'var(--color-white)' }}>
          <div className="h-full overflow-y-auto">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-hidden rounded-xl border shadow-2xl"
      style={{ maxWidth: 940, backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)' }}>
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--color-surface)' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--color-surface)' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--color-surface)' }} />
        </span>
        <span
          className="ml-2 truncate rounded-full px-3 py-1 text-[11px]"
          style={{ backgroundColor: 'var(--color-white)', color: 'var(--color-text-muted)' }}
        >
          {host}/gym/{code || 'your-gym'}
        </span>
      </div>
      <div className="overflow-y-auto" style={{ height: 620 }}>{children}</div>
    </div>
  );
}
