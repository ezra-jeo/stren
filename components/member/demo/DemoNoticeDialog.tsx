'use client';

import { Info, X } from 'lucide-react';
import { ViewportOverlay } from '@/components/ui/viewport-overlay';
import { DEMO_PREVIEW_NOTICE } from '@/lib/demo-member';

export function DemoNoticeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <ViewportOverlay
      onClose={onClose}
      labelledBy="demo-preview-notice-title"
      panelClassName="w-full max-w-sm rounded-2xl border border-(--color-surface) bg-white p-5 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <span className="member-icon-bubble" aria-hidden="true"><Info size={20} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="demo-preview-notice-title" className="font-semibold text-(--color-text-primary)">Preview only</h2>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">{DEMO_PREVIEW_NOTICE}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close preview notice" className="rounded-lg p-2 text-(--color-text-muted) hover:bg-black/5">
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <button type="button" onClick={onClose} className="mt-5 min-h-11 w-full rounded-xl bg-(--color-primary) px-4 text-sm font-semibold text-white">Got it</button>
    </ViewportOverlay>
  );
}
