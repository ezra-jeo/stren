'use client';

import Link from 'next/link';
import { ArrowRight, CalendarCheck, Flame, QrCode, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { MemberStats } from '@/lib/types';
import { isFeatureEnabled, type FeatureFlags } from '@/lib/features';
import { LapsedLockScreen, type LapsedSummary } from '@/components/member/LapsedLockScreen';
import { trainedThisWeek } from '@/lib/member-weekly-streak';

export interface MemberHomeData {
  memberName: string;
  stats: MemberStats;
  visitedDates: string[];
  peopleInGym: number | null;
  features?: FeatureFlags;
  subscriptionStatus?: 'active' | 'expired' | 'none';
  lapsedSummary?: LapsedSummary | null;
  gymName?: string | null;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function Recommendation({ href, icon: Icon, title, detail }: { href: string; icon: LucideIcon; title: string; detail: string }) {
  return (
    <Link href={href} className="member-recommendation group">
      <span className="member-icon-bubble" aria-hidden="true"><Icon size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-(--color-text-primary)">{title}</span>
        <span className="mt-0.5 block text-sm text-(--color-text-secondary)">{detail}</span>
      </span>
      <ArrowRight className="shrink-0 text-(--color-primary) transition-transform group-hover:translate-x-1" size={20} aria-hidden="true" />
    </Link>
  );
}

export function MemberHomeClient({ data }: { data: MemberHomeData }) {
  const firstName = data.memberName.trim().split(/\s+/)[0] || 'there';
  const trained = trainedThisWeek(data.visitedDates);

  if (data.subscriptionStatus === 'expired' && data.lapsedSummary) {
    return <LapsedLockScreen gymName={data.gymName} summary={data.lapsedSummary} />;
  }

  const recommendations = [
    ...(isFeatureEnabled(data.features, 'member_feed') ? [{ href: '/member/feed', icon: Users, title: 'Gym activity', detail: 'See recent updates from your gym.' }] : []),
    ...(isFeatureEnabled(data.features, 'leaderboards') ? [{ href: '/member/leaderboard', icon: Trophy, title: 'Latest ranks', detail: 'Track your consistency over time.' }] : []),
    { href: '/member/profile#member-qr', icon: QrCode, title: 'Your member QR code', detail: 'Keep it ready for front-desk check-in.' },
    { href: '/member/settings', icon: CalendarCheck, title: 'Account preferences', detail: 'Review the updates you receive.' },
  ].slice(0, 3);

  return (
    <div className="member-page space-y-6">
      <section className="member-home-hero" aria-labelledby="member-home-title">
        <div className="member-home-hero-image" aria-hidden="true" />
        <div className="relative z-10 max-w-xl">
          <h1 id="member-home-title" className="member-display-title">{greeting()}, {firstName}.</h1>
          <p className="mt-2 text-base text-(--color-text-secondary)">Ready when you are.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/member/profile#member-qr" className="member-primary-action">
              <QrCode size={21} aria-hidden="true" />
              Check in
            </Link>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm font-medium text-(--color-text-primary)">
            <Users size={19} aria-hidden="true" />
            {data.peopleInGym === null
              ? 'Gym availability is unavailable right now'
              : data.peopleInGym === 0
                ? 'The gym is quiet right now'
                : `${data.peopleInGym} ${data.peopleInGym === 1 ? 'person is' : 'people are'} at the gym now`}
          </p>
        </div>
      </section>

      <section className="member-status-strip" aria-label="Your weekly training status">
        <div className="member-status-item">
          <span className="member-icon-bubble" aria-hidden="true"><CalendarCheck size={20} /></span>
          <span><strong>{trained ? 'Trained this week' : 'This week is open'}</strong><small>{trained ? 'Nice work.' : 'One workout keeps it going.'}</small></span>
        </div>
        <div className="member-status-item">
          <span className="member-icon-bubble" aria-hidden="true"><Flame size={20} /></span>
          <span><strong>{data.stats.currentStreak}-week streak</strong><small>{data.stats.currentStreak ? 'Keep it going.' : 'Start your consistency streak.'}</small></span>
        </div>
        <div className="member-status-item">
          <span className="member-icon-bubble" aria-hidden="true"><Users size={20} /></span>
          <span><strong>{data.peopleInGym ?? '—'} {data.peopleInGym === 1 ? 'person' : 'people'}</strong><small>{data.peopleInGym === null ? 'Availability unavailable' : 'at the gym now'}</small></span>
        </div>
      </section>

      <section aria-labelledby="recommended-heading">
        <h2 id="recommended-heading" className="member-section-title">Recommended for you</h2>
        <div className="mt-3 space-y-2.5">
          {recommendations.map((recommendation) => <Recommendation key={recommendation.href} {...recommendation} />)}
        </div>
      </section>
    </div>
  );
}
