'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { browserAllowsPrefetch } from '@/lib/navigation-performance';

type IntentLinkProps = React.ComponentProps<typeof Link> & {
  transitionKind?: 'public-auth';
};

function hrefString(href: IntentLinkProps['href']): string {
  if (typeof href === 'string') return href;
  const pathname = href.pathname ?? '/';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(href.query ?? {})) {
    if (Array.isArray(value)) value.forEach((part) => search.append(key, String(part)));
    else if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  const hash = href.hash ? (String(href.hash).startsWith('#') ? String(href.hash) : `#${href.hash}`) : '';
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

function isPrimarySameTabNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.currentTarget.target !== '_blank';
}

export function IntentLink({ href, transitionKind, onClick, ...props }: IntentLinkProps) {
  const router = useRouter();
  const prefetched = useRef(false);
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destination = hrefString(href);

  function prefetch() {
    if (prefetched.current || !browserAllowsPrefetch()) return;
    prefetched.current = true;
    router.prefetch(destination);
  }

  useEffect(() => () => {
    if (cleanupTimer.current) clearTimeout(cleanupTimer.current);
    if (transitionKind && document.body.dataset.navigationKind === transitionKind) {
      delete document.body.dataset.navigationKind;
    }
  }, [transitionKind]);

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => { prefetch(); props.onPointerEnter?.(event); }}
      onFocus={(event) => { prefetch(); props.onFocus?.(event); }}
      onTouchStart={(event) => { prefetch(); props.onTouchStart?.(event); }}
      onClick={(event) => {
        onClick?.(event);
        if (transitionKind && !event.defaultPrevented && isPrimarySameTabNavigation(event)) {
          document.body.dataset.navigationKind = transitionKind;
          if (cleanupTimer.current) clearTimeout(cleanupTimer.current);
          cleanupTimer.current = setTimeout(() => {
            if (document.body.dataset.navigationKind === transitionKind) delete document.body.dataset.navigationKind;
          }, 4_000);
        }
      }}
    />
  );
}
