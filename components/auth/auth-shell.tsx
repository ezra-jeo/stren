'use client';

/**
 * Stren-branded chrome for the account auth screens — `/login`, `/signup`,
 * `/reset-password` (ImplementationPlan-UnifiedAccounts.md §5 U1).
 *
 * These are **Stren's pages, not a gym's**: neutral Stren branding, one obvious
 * action per screen, plain language. When the visitor arrived from a specific
 * gym (`?gym=CODE`), a small gym-flavored header names that gym so the moment
 * feels personal without the whole page pretending to belong to the gym.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export type GymFlavor = { name: string; logoUrl: string | null };

/**
 * Resolve the `?gym=CODE` flavor once, client-side, via `get_gym_by_code`.
 * Returns null while loading or when the code does not match a real gym — the
 * screens simply render their neutral Stren header in that case.
 */
export function useGymFlavor(code: string | null): { flavor: GymFlavor | null; loading: boolean } {
  const [flavor, setFlavor] = useState<GymFlavor | null>(null);
  const [loading, setLoading] = useState<boolean>(!!code);

  useEffect(() => {
    if (!code) {
      setFlavor(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void createClient()
      .rpc('get_gym_by_code', { p_code: code })
      .then(({ data }) => {
        if (!active) return;
        const gym = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
        if (gym && typeof gym.name === 'string') {
          setFlavor({ name: gym.name, logoUrl: typeof gym.logo_url === 'string' ? gym.logo_url : null });
        } else {
          setFlavor(null);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [code]);

  return { flavor, loading };
}

export function AuthShell({
  title,
  subtitle,
  flavor,
  flavorLabel,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  /** Gym-flavored header when the visitor came from a `?gym=CODE` link. */
  flavor?: GymFlavor | null;
  /** e.g. "Sign in to" / "Join" — precedes the gym name in the flavor header. */
  flavorLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main
      className="min-h-dvh flex flex-col items-center justify-center px-5 py-10"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div className="w-full max-w-sm">
        <Link href="/landing" className="mb-8 flex items-center justify-center gap-2">
          <Image src="/stren-logo.png" alt="Stren" width={32} height={32} className="object-contain" />
          <span
            className="text-xl font-bold"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-heading)' }}
          >
            Stren
          </span>
        </Link>

        <div
          className="rounded-2xl border p-6 shadow-sm"
          style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
        >
          {flavor && (
            <div
              className="mb-5 flex items-center gap-3 rounded-xl border p-3"
              style={{ backgroundColor: 'var(--color-primary-glow)', borderColor: 'var(--color-surface)' }}
            >
              {flavor.logoUrl ? (
                <div className="h-9 w-9 overflow-hidden rounded-lg border shrink-0" style={{ borderColor: 'var(--color-surface)' }}>
                  <Image src={flavor.logoUrl} alt={flavor.name} width={36} height={36} className="h-full w-full object-cover" />
                </div>
              ) : (
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
                >
                  {flavor.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                {flavorLabel && (
                  <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {flavorLabel}
                  </p>
                )}
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  {flavor.name}
                </p>
              </div>
            </div>
          )}

          <h1
            className="text-xl font-bold"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {subtitle}
            </p>
          )}

          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-sm">{footer}</div>}
      </div>
    </main>
  );
}

/** Shared field + button primitives so the three auth screens stay consistent. */

export function AuthField({
  label,
  id,
  ...props
}: { label: string; id: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus:border-(--color-primary) disabled:opacity-60"
        style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
        {...props}
      />
    </div>
  );
}

export function AuthSubmit({
  children,
  loading,
  ...props
}: { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
      disabled={loading || props.disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg border px-3 py-2 text-sm"
      style={{ backgroundColor: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)', color: 'var(--color-text-primary)' }}
    >
      {message}
    </p>
  );
}
