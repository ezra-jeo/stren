'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Dumbbell, Medal, Trophy, type LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import type { LeaderboardEntry } from '@/lib/types';
import { PageSkeleton } from '@/components/ui/loading-screen';

type LeaderboardCategory = 'workouts' | 'longest_member' | 'week_streak';
const categories: Record<LeaderboardCategory, { label: string; icon: LucideIcon; unit: string; description: string }> = {
  workouts: { label: 'Most workouts', icon: Dumbbell, unit: 'check-ins', description: 'All-time check-ins at this gym.' },
  longest_member: { label: 'Longest member', icon: Medal, unit: 'months', description: 'Time connected to this gym.' },
  week_streak: { label: 'Active weeks', icon: CalendarCheck, unit: 'weeks', description: 'Consecutive weeks with at least one check-in.' },
};

export interface LeaderboardClientProps { initialEntries: LeaderboardEntry[]; myMemberId: string | null; }

function MemberAvatar({ entry }: { entry: LeaderboardEntry }) {
  return entry.avatarUrl
    ? <img src={entry.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
    : <span className="member-avatar-initial" aria-hidden="true">{entry.memberName.charAt(0).toUpperCase()}</span>;
}

export function LeaderboardClient({ initialEntries, myMemberId }: LeaderboardClientProps) {
  const supabase = useMemo(() => createClient(), []);
  const cacheRef = useRef<Partial<Record<LeaderboardCategory, LeaderboardEntry[]>>>({ workouts: initialEntries });
  const [category, setCategory] = useState<LeaderboardCategory>('workouts');
  const [entries, setEntries] = useState(initialEntries);
  const [isLoading, setIsLoading] = useState(false);
  const myRank = entries.find((entry) => entry.memberId === myMemberId)?.rank ?? null;

  useEffect(() => { if (category !== 'workouts') void loadCategory(category); }, [category]);

  async function loadCategory(nextCategory: LeaderboardCategory) {
    const cached = cacheRef.current[nextCategory];
    if (cached) { setEntries(cached); return; }
    setIsLoading(true);
    const rpc = nextCategory === 'longest_member' ? 'leaderboard_longest_member' : 'leaderboard_week_streak';
    const { data } = await (supabase as any).rpc(rpc, { p_limit: 50 });
    const loaded = ((data ?? []) as { member_id: string; member_name: string; avatar_url: string | null; value: number }[]).map((row, index) => ({ memberId: row.member_id, memberName: row.member_name, avatarUrl: row.avatar_url, value: Number(row.value), rank: index + 1 }));
    cacheRef.current[nextCategory] = loaded;
    setEntries(loaded);
    setIsLoading(false);
  }

  const categoryInfo = categories[category];
  return (
    <div className="member-page space-y-6">
      <header>
        <h1 className="member-page-title">Ranks</h1>
        <p className="mt-3 text-sm text-(--color-text-secondary)">See where you stand and track consistency over time.</p>
      </header>

      <div className="member-surface overflow-x-auto" role="tablist" aria-label="Ranking category">
        <div className="flex min-w-max gap-1 p-1.5">
          {(Object.keys(categories) as LeaderboardCategory[]).map((item) => {
            const Icon = categories[item].icon;
            const selected = category === item;
            return <button key={item} role="tab" aria-selected={selected} onClick={() => setCategory(item)} className="flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors" style={{ backgroundColor: selected ? 'var(--color-primary-glow)' : 'transparent', color: selected ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)' }}><Icon size={17} aria-hidden="true" />{categories[item].label}</button>;
          })}
        </div>
      </div>

      <section className="member-status-strip" aria-label="Your ranking summary">
        <div className="member-status-item"><span className="member-icon-bubble"><Trophy size={20} /></span><span><small>Your position</small><strong>{myRank === null ? 'Not ranked yet' : `#${myRank} in ${categoryInfo.label.toLowerCase()}`}</strong></span></div>
        <div className="member-status-item"><span className="member-icon-bubble"><CalendarCheck size={20} /></span><span><small>Current category</small><strong>{categoryInfo.label}</strong></span></div>
        <div className="member-status-item"><span className="member-icon-bubble"><Dumbbell size={20} /></span><span><small>How it is measured</small><strong>{categoryInfo.description}</strong></span></div>
      </section>

      {isLoading ? <PageSkeleton rows={5} height={64} /> : entries.length === 0 ? (
        <section className="member-surface p-10 text-center"><Trophy size={38} className="mx-auto text-(--color-text-muted)" /><h2 className="mt-3 font-semibold text-(--color-text-primary)">Ranks appear after check-ins</h2><p className="mt-1 text-sm text-(--color-text-secondary)">Your first check-in is all it takes to start building consistency.</p></section>
      ) : (
        <section className="member-surface overflow-hidden" aria-label={`${categoryInfo.label} leaderboard`}>
          <div className="hidden grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-4 border-b px-5 py-3 text-xs font-semibold uppercase tracking-wider text-(--color-text-muted) md:grid" style={{ borderColor: 'var(--color-surface)' }}><span>Rank</span><span>Member</span><span>{categoryInfo.unit}</span></div>
          <div className="divide-y" style={{ borderColor: 'var(--color-surface)' }}>
            {entries.map((entry) => {
              const mine = entry.memberId === myMemberId;
              return <div key={entry.memberId} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 md:grid-cols-[4.5rem_minmax(0,1fr)_auto] md:gap-4 md:px-5" style={{ backgroundColor: mine ? 'var(--color-primary-glow)' : 'transparent' }}>
                <span className="text-center text-sm font-bold" style={{ color: mine ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)' }}>{entry.rank}</span>
                <span className="flex min-w-0 items-center gap-3"><MemberAvatar entry={entry} /><span className="truncate text-sm font-semibold text-(--color-text-primary)">{entry.memberName}{mine && <span className="ml-2 text-xs font-medium text-(--color-primary-dark)">(You)</span>}</span></span>
                <span className="text-right text-sm font-bold text-(--color-text-primary)">{entry.value}<span className="ml-1 text-xs font-normal text-(--color-text-muted)">{entry.value === 1 ? categoryInfo.unit.replace(/s$/, '') : categoryInfo.unit}</span></span>
              </div>;
            })}
          </div>
        </section>
      )}

      <section className="member-surface flex gap-3 p-5"><span className="member-icon-bubble"><Trophy size={20} /></span><div><h2 className="font-semibold text-(--color-text-primary)">How rankings work</h2><p className="mt-1 text-sm text-(--color-text-secondary)">{category === 'week_streak' ? 'A week is complete after one check-in. Rest days never break a weekly streak.' : categoryInfo.description}</p></div></section>
    </div>
  );
}
