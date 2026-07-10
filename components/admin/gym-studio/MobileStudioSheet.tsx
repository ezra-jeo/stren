'use client';

import { useEffect, useRef } from 'react';
import { useStudio } from './GymPageStudio';
import { PreviewSurface } from './PreviewPane';
import type { GymPreviewView } from '@/components/gym/GymLandingPreview';

const TABS: { key: GymPreviewView; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'join', label: 'Join' },
  { key: 'contact', label: 'Contact' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'locate', label: 'Locate' },
];

/** Mobile preview drawer (§7.4). Focus-traps, Escape closes, tabs switch views. */
export function MobileStudioSheet() {
  const s = useStudio();
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!s.drawerOpen) return;
    doneRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') s.setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.drawerOpen, s]);

  if (!s.drawerOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Live preview">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(20,16,12,0.5)' }} onClick={() => s.setDrawerOpen(false)} />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[20px]"
        style={{ height: '90%', backgroundColor: 'var(--color-surface)' }}
      >
        <div className="flex justify-center py-2">
          <span className="h-1 w-10 rounded-full" style={{ backgroundColor: 'var(--color-text-muted)' }} />
        </div>
        <div className="flex items-center gap-2 px-3.5 pb-2.5">
          <span className="text-sm font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>Live preview</span>
          <span className="rounded-md px-2 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-text-muted)' }}>as members see it</span>
          <button
            ref={doneRef}
            type="button"
            onClick={() => s.setDrawerOpen(false)}
            className="ml-auto rounded-full px-4 py-1.5 text-xs font-bold"
            style={{ backgroundColor: 'var(--color-text-primary)', color: 'var(--color-white)' }}
          >
            Done
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5">
          {TABS.map((t) => {
            const active = s.previewTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { s.setPreviewTab(t.key); if (t.key !== 'home' && t.key !== 'join') s.setFocalEditing(false); }}
                className="flex-none rounded-full px-3 py-1.5 text-xs font-semibold"
                style={active ? { backgroundColor: 'var(--color-text-primary)', color: 'var(--color-white)' } : { backgroundColor: 'var(--color-white)', color: 'var(--color-text-secondary)' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="mx-3 mb-3 flex-1 overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--color-white)' }}>
          <div className="h-full overflow-y-auto">
            <PreviewSurface device="mobile" />
          </div>
        </div>
      </div>
    </div>
  );
}
