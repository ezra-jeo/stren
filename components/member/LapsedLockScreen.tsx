'use client';

/**
 * Lapsed-member renewal lock screen (grill decision; §2.6, §5 U2).
 *
 * A member whose gym-user row is active but whose subscription has expired sees
 * this instead of stats/feed/leaderboard. It is **warm, not punitive** — it
 * names what's saved (streak, visits, member-since from `lapsed_summary`) so the
 * loss is visible and the renewal is instant. Data is never deleted; the gate
 * reads current subscription status, so unlock needs no state flip.
 */

import { Lock, Flame, CalendarCheck, CalendarDays } from 'lucide-react';

export type LapsedSummary = {
  current_streak: number;
  best_streak: number;
  total_visits: number;
  member_since: string | null;
};

function monthsSince(iso: string | null): string | null {
  if (!iso) return null;
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (months < 1) return 'this month';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'}`;
}

export function LapsedLockScreen({ gymName, summary }: { gymName?: string | null; summary: LapsedSummary }) {
  const since = monthsSince(summary.member_since);
  const savedStats: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Flame size={18} />, label: 'Best streak', value: `${summary.best_streak} week${summary.best_streak === 1 ? '' : 's'}` },
    { icon: <CalendarCheck size={18} />, label: 'Total visits', value: `${summary.total_visits}` },
  ];
  if (since) {
    savedStats.push({ icon: <CalendarDays size={18} />, label: 'Member for', value: since });
  }

  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)', color: 'var(--color-white)' }}
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <Lock size={22} />
        </div>
        <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          Welcome back{gymName ? ` to ${gymName}` : ''}!
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm" style={{ opacity: 0.9 }}>
          Your membership has lapsed — but nothing is lost. Everything you&apos;ve earned is saved and waiting for you.
        </p>
      </div>

      <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
          Saved for you
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {savedStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border p-3 text-center"
              style={{ borderColor: 'var(--color-surface)' }}
            >
              <div className="mx-auto mb-1 flex justify-center" style={{ color: 'var(--color-primary)' }}>
                {stat.icon}
              </div>
              <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                {stat.value}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="rounded-2xl border p-5 text-center"
        style={{ backgroundColor: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Renew at the front desk to unlock everything
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Your streak, visits, and stats come right back the moment your membership is renewed. Just show your QR code at
          the desk.
        </p>
      </div>
    </div>
  );
}
