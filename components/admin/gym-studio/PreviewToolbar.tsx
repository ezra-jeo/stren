'use client';

import { Monitor, Smartphone, SquareDashed } from 'lucide-react';
import { useStudio } from './GymPageStudio';
import type { GymPreviewView } from '@/components/gym/GymLandingPreview';

const TABS: { key: GymPreviewView; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'join', label: 'Join' },
  { key: 'contact', label: 'Contact' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'locate', label: 'Locate' },
];

export function PreviewToolbar() {
  const s = useStudio();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)' }}>
      <div role="tablist" aria-label="Preview page" className="flex gap-0.5 rounded-[10px] p-0.5" style={{ backgroundColor: 'var(--color-surface)' }}>
        {TABS.map((t) => {
          const active = s.previewTab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => { s.setPreviewTab(t.key); if (t.key !== 'home' && t.key !== 'join') s.setFocalEditing(false); }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={active ? { backgroundColor: 'var(--color-white)', color: 'var(--color-text-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : { color: 'var(--color-text-muted)' }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={s.showSafeArea}
          aria-label="Safe area guide"
          onClick={() => s.setShowSafeArea(!s.showSafeArea)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={s.showSafeArea ? { backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' } : { color: 'var(--color-text-muted)' }}
        >
          <SquareDashed size={15} /> Safe area
        </button>

        <div className="flex gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: 'var(--color-surface)' }}>
          <button
            type="button"
            aria-label="Desktop preview"
            aria-pressed={s.previewDevice === 'desktop'}
            onClick={() => s.setPreviewDevice('desktop')}
            className="rounded-md p-1.5"
            style={s.previewDevice === 'desktop' ? { backgroundColor: 'var(--color-white)', color: 'var(--color-text-primary)' } : { color: 'var(--color-text-muted)' }}
          >
            <Monitor size={16} />
          </button>
          <button
            type="button"
            aria-label="Mobile preview"
            aria-pressed={s.previewDevice === 'mobile'}
            onClick={() => s.setPreviewDevice('mobile')}
            className="rounded-md p-1.5"
            style={s.previewDevice === 'mobile' ? { backgroundColor: 'var(--color-white)', color: 'var(--color-text-primary)' } : { color: 'var(--color-text-muted)' }}
          >
            <Smartphone size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
