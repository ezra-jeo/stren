'use client';

import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useStudio } from './GymPageStudio';

/**
 * Essentials checklist banner (§7.6). Dismissal persists per gym in localStorage;
 * the banner auto-hides at 5/5.
 */
export function GettingStartedBanner() {
  const s = useStudio();
  const storageKey = s.gymId ? `stren.studio.checklistDismissed.${s.gymId}` : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissed(window.localStorage.getItem(storageKey) === '1');
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);

  const done = s.checklist.filter((c) => c.done).length;
  const total = s.checklist.length;
  const pct = Math.round((done / total) * 100);

  if (dismissed || done >= total) return null;

  const dismiss = () => {
    setDismissed(true);
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, '1');
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div
      className="mx-6 mt-5 flex items-center gap-4 rounded-2xl border p-4"
      style={{ backgroundColor: 'var(--color-primary-glow)', borderColor: 'var(--color-surface)' }}
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--color-primary)' }}>
        <Sparkles size={20} color="#fff" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 text-[15px] font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
          Finish your gym page ·{' '}
          <span style={{ color: 'var(--color-primary)' }}>{done} of {total} essentials done</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.checklist.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => s.openGroup(c.group)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
              style={
                c.done
                  ? { backgroundColor: 'var(--color-success-bg)', borderColor: 'var(--color-success)', color: 'var(--color-success)' }
                  : { backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: c.done ? 'var(--color-success)' : 'transparent', boxShadow: c.done ? 'none' : '0 0 0 1px var(--color-text-muted)' }}
              />
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[52px] w-[52px] flex-none">
        <div
          className="h-full w-full rounded-full"
          style={{ background: `conic-gradient(var(--color-primary) ${pct}%, var(--color-surface) 0)` }}
        />
        <div className="absolute inset-[6px] flex items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-white)' }}>
          <span className="text-[13px] font-bold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-heading)' }}>{pct}%</span>
        </div>
      </div>

      <button type="button" aria-label="Dismiss checklist" onClick={dismiss} className="flex-none" style={{ color: 'var(--color-text-muted)' }}>
        <X size={17} />
      </button>
    </div>
  );
}
