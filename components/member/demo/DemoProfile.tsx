'use client';

import Image from 'next/image';
import { Camera, CalendarDays, Edit2, Mail, Phone, ShieldCheck, Upload, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { DEMO_MEMBER_DATA, demoInitials } from '@/lib/demo-member';
import { DemoNoticeDialog } from '@/components/member/demo/DemoNoticeDialog';

function IdentityAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null | undefined }) {
  return avatarUrl ? (
    <img src={avatarUrl} alt={`${name} profile photo`} className="h-28 w-28 rounded-full border border-(--color-surface) object-cover" />
  ) : (
    <span className="demo-profile-avatar" aria-label={`${name} initials`}>{demoInitials(name)}</span>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="member-icon-bubble" aria-hidden="true"><Icon size={19} /></span>
      <span className="min-w-0"><small className="block text-xs text-(--color-text-muted)">{label}</small><strong className="mt-0.5 block truncate text-sm text-(--color-text-primary)">{value}</strong></span>
    </div>
  );
}

export function DemoProfile() {
  const { profile, user } = useAuth();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const name = profile?.name?.trim() || 'Member';
  const email = profile?.email || user?.email || 'Signed-in member';
  const memberSince = profile?.createdAt
    ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(profile.createdAt))
    : 'Not available';
  const showNotice = () => setNoticeOpen(true);

  return (
    <div className="member-page space-y-5">
      <header>
        <h1 className="member-page-title">Profile</h1>
        <p className="mt-2 text-sm text-(--color-text-secondary)">Manage your account and gym identity.</p>
        <p className="mt-1 text-xs font-medium text-(--color-text-muted)">You’re viewing demo data. Nothing here will affect your real account.</p>
      </header>

      <section className="demo-gym-card" aria-label="Current demo gym">
        <Image src="/stren-logo.png" alt="" width={54} height={54} className="h-13 w-13 object-contain" />
        <div className="min-w-0 flex-1"><p className="member-eyebrow">Current gym</p><h2>{DEMO_MEMBER_DATA.gym.name}</h2><span>{DEMO_MEMBER_DATA.gym.subtitle}</span></div>
        <strong>Demo</strong>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="member-surface flex flex-col items-center p-6 text-center sm:flex-row sm:text-left">
          <IdentityAvatar name={name} avatarUrl={profile?.avatarUrl} />
          <div className="mt-4 min-w-0 sm:mt-0 sm:ml-6">
            <h2 className="font-serif text-3xl font-semibold text-(--color-text-primary)">{name}</h2>
            <p className="mt-1 truncate text-sm text-(--color-text-secondary)">{email}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button type="button" onClick={showNotice} className="member-primary-action min-h-11! px-4! text-sm!"><Camera size={17} aria-hidden="true" />Photo</button>
              <button type="button" onClick={showNotice} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-(--color-surface) px-4 text-sm font-semibold"><Upload size={17} aria-hidden="true" />Upload</button>
            </div>
          </div>
        </section>

        <section id="demo-member-qr" className="member-surface p-5 text-center">
          <h2 className="member-eyebrow">Member QR code</h2>
          <div className="demo-invalid-qr" role="img" aria-label="Unusable demo QR code" data-demo-qr="invalid">
            <span className="demo-qr-noise" aria-hidden="true" />
            <Image src="/stren-logo.png" alt="" width={48} height={48} className="demo-qr-logo" />
            <strong aria-hidden="true">Demo</strong>
          </div>
          <p className="mt-3 text-sm font-semibold text-(--color-primary-dark)">Demo QR code — preview only</p>
          <p className="mt-1 text-xs text-(--color-text-muted)">This QR code cannot be used to check in.</p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="member-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="member-eyebrow">Personal information</h2>
            <button type="button" onClick={showNotice} aria-label="Edit personal information" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-(--color-primary-dark)"><Edit2 size={16} aria-hidden="true" />Edit</button>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <InfoItem icon={UserRound} label="Full name" value={name} />
            <InfoItem icon={Phone} label="Contact number" value={profile?.contactNumber || 'Not set'} />
            <InfoItem icon={Mail} label="Email" value={email} />
            <InfoItem icon={CalendarDays} label="Account member since" value={memberSince} />
          </div>
        </section>

        <section className="member-surface p-5">
          <h2 className="member-eyebrow">Membership</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <span className="text-(--color-text-muted)">Gym</span><strong className="text-right text-(--color-text-primary)">{DEMO_MEMBER_DATA.gym.name}</strong>
            <span className="text-(--color-text-muted)">Plan</span><strong className="text-right text-(--color-text-primary)">{DEMO_MEMBER_DATA.membership.planName}</strong>
            <span className="text-(--color-text-muted)">Status</span><strong className="text-right text-(--color-success)">{DEMO_MEMBER_DATA.membership.status}</strong>
            <span className="text-(--color-text-muted)">Valid until</span><strong className="text-right text-(--color-text-primary)">{DEMO_MEMBER_DATA.membership.validUntil}</strong>
          </div>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-(--color-primary-glow) p-3 text-xs leading-5 text-(--color-text-secondary)"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-(--color-primary-dark)" aria-hidden="true" />This is sample membership data. No real charges will be made.</p>
        </section>
      </div>

      <p className="rounded-xl border border-(--color-primary-glow) px-4 py-3 text-center text-xs text-(--color-text-secondary)">This is a demo preview. All gym and membership information shown here is sample data.</p>
      <DemoNoticeDialog open={noticeOpen} onClose={() => setNoticeOpen(false)} />
    </div>
  );
}
