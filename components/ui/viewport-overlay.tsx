'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface ViewportOverlayProps {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
}

/**
 * Portals member dialogs above route-transition containers and fixed mobile
 * navigation so their backdrop always covers the real browser viewport.
 */
export function ViewportOverlay({
  children,
  onClose,
  labelledBy,
  panelClassName,
  panelStyle,
}: ViewportOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-viewport-overlay>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className="absolute inset-0 cursor-default bg-black/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn('relative z-10', panelClassName)}
        style={panelStyle}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
