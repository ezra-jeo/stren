'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isFeatureEnabled, type FeatureFlags, type FeatureKey } from '@/lib/features';

type GymTopNavProps = {
  gymName: string;
  gymCode: string;
  isPublished: boolean;
  /** Public feature flags (§8.5). Wired by Agent B from the public payload; defaults to on. */
  features?: Pick<FeatureFlags, 'public_pricing' | 'public_location'>;
};

const NAV_LINKS: { href: string; label: string; feature?: FeatureKey }[] = [
  { href: '', label: 'Home' },
  { href: '/contact', label: 'Contact' },
  { href: '/pricing', label: 'Pricing', feature: 'public_pricing' },
  { href: '/locate', label: 'Locate Us', feature: 'public_location' },
];

export function GymTopNav({ gymName, gymCode, isPublished, features }: GymTopNavProps) {
  const pathname = usePathname();

  if (!isPublished) return null;
  if (pathname === `/gym/${gymCode}/login` || pathname === `/gym/${gymCode}/signup`) {
    return null;
  }

  const navLinks = NAV_LINKS.filter((link) => !link.feature || isFeatureEnabled(features, link.feature));

  return (
    <nav
      className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-sm"
      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0.25))' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 md:px-16 md:py-3">
        <Link
          href={`/gym/${gymCode}`}
          className="max-w-[40vw] truncate text-[11px] font-medium uppercase tracking-[0.18em] text-white/85 transition-opacity hover:text-white sm:text-xs md:max-w-none md:text-sm"
        >
          {gymName}
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={`/gym/${gymCode}${href}`}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white md:text-sm"
            >
              {label}
            </Link>
          ))}
        </div>

        <Link href={`/gym/${encodeURIComponent(gymCode)}/signup`}>
          <button
            className="rounded-full px-4 py-1.5 text-xs font-semibold sm:px-5 sm:py-2 md:text-sm"
            style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-white)' }}
          >
            Join
          </button>
        </Link>
      </div>
    </nav>
  );
}
