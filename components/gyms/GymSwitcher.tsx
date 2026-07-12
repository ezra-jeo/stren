'use client';

/**
 * Gym switcher (§5 U3) — the shell control that swaps the **active gym**.
 * Gyms switch; the account never does (CONTEXT.md).
 *
 * Anchor = the current gym's name/logo. The menu lists the account's other
 * gyms (role-labeled) to switch into, a **Member view / Admin view** toggle
 * (managers are members too — §2.1), an "All gyms" link to the hub, and sign
 * out. Switching calls `setActiveGymAction` then refreshes to the returned
 * role's surface. Single-gym accounts get the simpler reading (no switch list).
 *
 * Keyboard + screen-reader operable per the A6 drawer-tablist precedent:
 * `aria-haspopup`/`aria-expanded` anchor, `role="menu"` with `menuitem`s,
 * Escape + click-outside to close, arrow-key navigation, focus returns to the
 * anchor on close.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check, LayoutGrid, LogOut, Eye } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { setActiveGymAction } from '@/lib/auth-actions';
import type { MyGym } from '@/lib/types';
import { GymAvatar, roleLabel } from '@/components/gyms/gym-badges';

const MANAGER_ROLES: MyGym['role'][] = ['owner', 'admin', 'staff'];

export function GymSwitcher({ variant }: { variant: 'admin' | 'member' }) {
  const { myGyms, activeGymId, signOut, isSigningOut, refreshProfile, refreshMyGyms } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeGyms = myGyms.filter((g) => g.status === 'active');
  const current = myGyms.find((g) => g.gymId === activeGymId) ?? activeGyms[0] ?? null;
  const others = activeGyms.filter((g) => g.gymId !== current?.gymId);
  const currentIsManager = current ? MANAGER_ROLES.includes(current.role) : false;

  const close = useCallback((focusAnchor = true) => {
    setOpen(false);
    if (focusAnchor) anchorRef.current?.focus();
  }, []);

  // Close on outside click / Escape; focus the first item when opening.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current || !anchorRef.current) return;
      if (!menuRef.current.contains(e.target as Node) && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  async function switchTo(gym: MyGym) {
    if (gym.gymId === current?.gymId) {
      close();
      return;
    }
    setBusyId(gym.gymId);
    try {
      const { role } = await setActiveGymAction(gym.gymId);
      await Promise.all([refreshProfile(), refreshMyGyms()]);
      setOpen(false);
      router.push(role === 'member' ? '/member' : '/admin');
      router.refresh();
    } catch {
      setBusyId(null);
    }
  }

  function goToSurface(surface: '/admin' | '/member') {
    setOpen(false);
    router.push(surface);
    router.refresh();
  }

  if (!current) {
    // No active gym resolved yet — a quiet neutral anchor, no menu.
    return (
      <div className="flex items-center gap-2">
        <GymAvatar name="Stren" logoUrl={null} size={32} />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Stren
        </span>
      </div>
    );
  }

  const anchorTextColor = variant === 'admin' ? 'hsl(var(--light-gray))' : 'var(--color-text-primary)';

  return (
    <div className="relative">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current gym: ${current.name}. Switch gym`}
        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-black/5"
      >
        <GymAvatar name={current.name} logoUrl={current.logoUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight" style={{ color: anchorTextColor, fontFamily: 'var(--font-heading)' }}>
            {current.name}
          </p>
          <p className="text-[11px] capitalize" style={{ color: 'hsl(var(--gray))' }}>
            {roleLabel(current.role)}
          </p>
        </div>
        <ChevronDown size={16} style={{ color: 'hsl(var(--gray))' }} className="shrink-0" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Switch gym"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border shadow-lg"
          style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
        >
          {others.length > 0 && (
            <div className="border-b py-1" style={{ borderColor: 'var(--color-surface)' }}>
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Switch gym
              </p>
              {others.map((gym) => (
                <button
                  key={gym.gymId}
                  role="menuitem"
                  type="button"
                  onClick={() => switchTo(gym)}
                  disabled={busyId === gym.gymId}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/5 disabled:opacity-60"
                >
                  <GymAvatar name={gym.name} logoUrl={gym.logoUrl} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {gym.name}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {busyId === gym.gymId ? 'Switching…' : roleLabel(gym.role)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="py-1">
            {/* Member/Admin view toggle — managers are members too (§2.1). */}
            {variant === 'admin' && (
              <MenuAction icon={<Eye size={16} />} label="Member view" onClick={() => goToSurface('/member')} />
            )}
            {variant === 'member' && currentIsManager && (
              <MenuAction icon={<Eye size={16} />} label="Admin view" onClick={() => goToSurface('/admin')} />
            )}
            <MenuLink icon={<LayoutGrid size={16} />} label="All gyms" href="/gyms" onNavigate={() => setOpen(false)} />
          </div>

          <div className="border-t py-1" style={{ borderColor: 'var(--color-surface)' }}>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              disabled={isSigningOut}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-black/5 disabled:opacity-60"
              style={{ color: 'var(--color-danger)' }}
            >
              <LogOut size={16} />
              {isSigningOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-black/5"
      style={{ color: 'var(--color-text-primary)' }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
      {label}
    </button>
  );
}

function MenuLink({
  icon,
  label,
  href,
  onNavigate,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  onNavigate: () => void;
}) {
  const router = useRouter();
  return (
    <button
      role="menuitem"
      type="button"
      onClick={() => {
        onNavigate();
        router.push(href);
      }}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-black/5"
      style={{ color: 'var(--color-text-primary)' }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
      {label}
    </button>
  );
}
