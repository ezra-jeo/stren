'use client';

import { useEffect, useState } from 'react';
import { Eye, Save } from 'lucide-react';
import { useStudio } from './GymPageStudio';
import { GettingStartedBanner } from './GettingStartedBanner';
import { StudioHeader } from './StudioHeader';
import { ControlRail } from './ControlRail';
import { PreviewPane } from './PreviewPane';
import { MobileStudioSheet } from './MobileStudioSheet';

/** Warn before leaving with unsaved changes (§7.10): browser prompt + in-app confirm. */
function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank') return;
      if (!window.confirm('You have unsaved changes — leave anyway?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);
}

/** Desktop vs mobile layout, JS-driven so exactly one pane mounts (SSR-safe default: desktop). */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return desktop;
}

export function StudioLayout() {
  const s = useStudio();
  useUnsavedChangesGuard(s.dirty);
  const isDesktop = useIsDesktop();

  const uploading = s.isUploadingLogo || s.isUploadingCover;

  return (
    <div className="flex min-h-[600px] flex-col lg:h-[calc(100vh-6rem)]" style={{ backgroundColor: 'var(--color-background)' }}>
      <GettingStartedBanner />
      <StudioHeader />

      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-[404px] flex-none overflow-y-auto border-r p-5" style={{ borderColor: 'var(--color-surface)' }}>
            <ControlRail />
          </div>
          <PreviewPane />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 pb-24">
            <ControlRail />
          </div>
          <div
            className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2.5 border-t px-3 py-2.5"
            style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
          >
            <button
              type="button"
              onClick={() => s.setDrawerOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
            >
              <Eye size={17} /> Preview my page
            </button>
            <button
              type="button"
              aria-label="Save changes"
              onClick={() => void s.save()}
              disabled={!s.dirty || s.isSaving || uploading}
              className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-xl border disabled:opacity-60"
              style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
            >
              <Save size={18} />
            </button>
          </div>
          <MobileStudioSheet />
        </>
      )}
    </div>
  );
}
