'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const alertRef = useRef<HTMLElement>(null);
  useEffect(() => { alertRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <section ref={alertRef} role="alert" aria-live="assertive" tabIndex={-1} className="mx-auto max-w-2xl rounded-2xl border border-(--admin-border) bg-(--admin-surface) p-6" aria-labelledby="admin-route-error-title">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--color-danger-bg) text-(--color-danger)"><AlertCircle aria-hidden="true" /></span>
      <h1 id="admin-route-error-title" className="mt-4 text-xl font-bold text-(--admin-text)">This page could not refresh</h1>
      <p className="mt-2 text-sm leading-6 text-(--admin-text-2)">Your navigation and gym context are still available. Check your connection, then try this page again.</p>
      <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-(--color-primary) px-4 font-semibold text-white"><RefreshCw size={17} aria-hidden="true" />Try again</button>
    </section>
  );
}
