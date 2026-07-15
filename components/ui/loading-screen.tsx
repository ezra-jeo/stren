'use client';

import Image from 'next/image';
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export function LoadingScreen({
  message = 'Setting things up for you…',
  detail,
  overlay = false,
}: {
  message?: string;
  detail?: string;
  overlay?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cn('stren-bootstrap', overlay && 'stren-bootstrap-overlay')}
    >
      <StrenLoaderMark />
      <div className="stren-bootstrap-copy">
        <p>{message}</p>
        {detail && <span>{detail}</span>}
      </div>
      <div className="stren-bootstrap-progress" aria-hidden="true"><span /></div>
    </div>
  );
}

function StrenLoaderMark() {
  return (
    <div className="stren-bootstrap-mark" aria-hidden="true">
      <Image
        src="/stren-logo.png"
        alt=""
        width={86}
        height={90}
        priority
        unoptimized
        className="stren-mark-reveal"
      />
      <Image
        src="/stren-logo.png"
        alt=""
        width={86}
        height={90}
        priority
        unoptimized
        className="stren-mark-lockup"
      />
    </div>
  );
}

export function PrivacyCurtain({ message, detail }: { message: string; detail?: string }) {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !dialogRef.current) return;
    const curtain = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(document.body.children).filter((element) => element !== curtain);
    const snapshots = siblings.map((element) => ({
      element: element as HTMLElement,
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

    snapshots.forEach(({ element }) => {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    });
    curtain.focus({ preventScroll: true });

    return () => {
      snapshots.forEach(({ element, inert, ariaHidden }) => {
        if (!inert) element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      ref={dialogRef}
      className="stren-privacy-curtain"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelId}
      tabIndex={-1}
    >
      <div className="stren-privacy-curtain-content" role="status" aria-live="polite" aria-atomic="true">
        <StrenLoaderMark />
        <div className="stren-bootstrap-copy">
          <p id={labelId}>{message}</p>
          {detail && <span>{detail}</span>}
        </div>
        <div className="stren-bootstrap-progress" aria-hidden="true"><span /></div>
      </div>
    </div>,
    document.body,
  );
}

export function SkeletonBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cn('stren-skeleton-block', className)} style={style} />;
}

export function PageSkeleton({
  rows = 4,
  height = 80,
  delayMs = 90,
}: {
  rows?: number;
  height?: number;
  delayMs?: number;
}) {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return (
    <div
      data-skeleton-reserved="true"
      aria-hidden="true"
      className="stren-skeleton-reserved"
      style={{ minHeight: rows * height + Math.max(0, rows - 1) * 12 }}
    >
      {visible && (
        <div data-skeleton-visible="true" className="stren-skeleton-wave space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            <SkeletonBlock key={index} className="w-full rounded-xl" style={{ height }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminRouteSkeleton() {
  return (
    <div className="stren-skeleton-wave space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-48 rounded-lg" />
        <SkeletonBlock className="h-4 w-80 max-w-full rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-20 rounded-xl" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonBlock className="h-72 rounded-xl" />
        <SkeletonBlock className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

export function MemberRouteSkeleton({ home = false }: { home?: boolean }) {
  return (
    <div className="stren-skeleton-wave member-page space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-28 rounded-md" />
        <SkeletonBlock className="h-12 w-72 max-w-full rounded-xl" />
      </div>
      {home ? (
        <>
          <SkeletonBlock className="h-80 rounded-[1.75rem]" />
          <div className="grid gap-px overflow-hidden rounded-2xl sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <SkeletonBlock key={index} className="h-24 rounded-none" />)}
          </div>
          <div className="grid gap-4 md:grid-cols-2"><SkeletonBlock className="h-28 rounded-2xl" /><SkeletonBlock className="h-28 rounded-2xl" /></div>
        </>
      ) : (
        <>
          <SkeletonBlock className="h-40 rounded-2xl" />
          <SkeletonBlock className="h-64 rounded-2xl" />
        </>
      )}
    </div>
  );
}

export function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'var(--color-primary)'}
      strokeWidth={2.5}
      className="stren-inline-spinner"
      role="img"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="8.5" strokeOpacity="0.2" />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" strokeLinecap="round" />
    </svg>
  );
}
