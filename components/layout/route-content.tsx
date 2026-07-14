'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function RouteContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const regionRef = useRef<HTMLDivElement>(null);
  const previousRoute = useRef(routeKey);

  useEffect(() => {
    if (previousRoute.current === routeKey) return;
    previousRoute.current = routeKey;
    const frame = window.requestAnimationFrame(() => {
      regionRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [routeKey]);

  return (
    <div
      key={routeKey}
      ref={regionRef}
      tabIndex={-1}
      role="region"
      aria-label="Page content"
      className="route-content-enter outline-none"
      data-route-content={routeKey}
    >
      {children}
    </div>
  );
}
