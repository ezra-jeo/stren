'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function MemberRouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const alertRef = useRef<HTMLElement>(null);
  useEffect(() => { alertRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <section ref={alertRef} role="alert" aria-live="assertive" tabIndex={-1} className="member-surface max-w-2xl p-6" aria-labelledby="member-route-error-title">
      <span className="member-icon-bubble"><AlertCircle aria-hidden="true" /></span>
      <h1 id="member-route-error-title" className="mt-4 text-xl font-bold text-(--color-text-primary)">We couldn’t refresh this page</h1>
      <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Your gym and navigation are still here. Check your connection, then try again.</p>
      <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-(--color-primary) px-4 font-semibold text-white"><RefreshCw size={17} aria-hidden="true" />Try again</button>
    </section>
  );
}
