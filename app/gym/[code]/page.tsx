import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Phone, Facebook, Instagram, Globe } from 'lucide-react';
import { getGymAssetPublicUrl, getGymPublicByCode } from '@/lib/gym-public';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { canPreviewUnpublishedGym } from '@/lib/gym-visibility';
import type { Json } from '@/lib/database.types';

export const revalidate = 3600;

type GymData = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  tagline: string | null;
  description: string | null;
  logo_path: string | null;
  logo_url: string | null;
  cover_path: string | null;
  cover_url: string | null;
  brand_color: string;
  secondary_color?: string | null;
  operating_hours: Record<string, string> | null;
  amenities: string[] | null;
  social_links: { facebook?: string; instagram?: string; website?: string } | null;
  member_count: number;
  is_published: boolean;
};

type PageProps = {
  params: Promise<{ code: string }> | { code: string };
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export default async function GymPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const { code, data } = await getGymPublicByCode(rawCode);
  if (!data) notFound();

  const rpcData = data as typeof data & {
    logo_path?: string | null;
    cover_path?: string | null;
  };

  const resolvedLogoPath = normalizeStoragePath(rpcData.logo_path ?? data.logo_url);
  const resolvedCoverPath = normalizeStoragePath(rpcData.cover_path ?? data.cover_url);

  const resolvedLogoUrl = resolvedLogoPath
    ? getGymAssetPublicUrl(resolvedLogoPath)
    : data.logo_url;
  const resolvedCoverUrl = resolvedCoverPath
    ? getGymAssetPublicUrl(resolvedCoverPath)
    : data.cover_url;

  const gym: GymData = {
    ...data,
    logo_path: resolvedLogoPath,
    cover_path: resolvedCoverPath,
    logo_url: resolvedLogoUrl,
    cover_url: resolvedCoverUrl,
    secondary_color: (data as { secondary_color?: string | null }).secondary_color ?? null,
    operating_hours: toOperatingHours(data.operating_hours),
    social_links: toSocialLinks(data.social_links),
  };

  let canManagementPreview = false;
  if (!gym.is_published) {
    canManagementPreview = await canCurrentUserPreviewUnpublishedGym(gym.id);
    if (!canManagementPreview) {
      return <ComingSoonPage gym={gym} />;
    }
  }

  return <GymLandingPage gym={gym} isManagementPreview={!gym.is_published && canManagementPreview} />;
}

function ComingSoonPage({ gym }: { gym: GymData }) {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--color-secondary), var(--color-primary-dark), var(--color-primary))' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_40%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.08),transparent_35%)]" />
      <div className="relative z-10 flex justify-start px-6 pt-6 sm:px-8">
        <Link
          href="/landing"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/15"
        >
          &larr; Back to Stren
        </Link>
      </div>
      <div className="flex min-h-screen items-center justify-center px-5 sm:px-6">
        <div className="relative z-10 max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/85">
            Coming soon
          </div>
          <h1
            className="text-4xl font-bold tracking-tight sm:text-5xl md:text-7xl"
            style={{ color: 'var(--color-white)', fontFamily: 'var(--font-heading)' }}
          >
            {gym.name}
          </h1>
          <p className="mt-4 text-lg sm:text-xl md:text-2xl" style={{ color: 'var(--color-white)', opacity: 0.85 }}>
            This gym has not published its public landing page yet, but staff can still log in.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={`/gym/${encodeURIComponent(gym.code)}/login?from=landing`}>
              <button
                className="w-full rounded-full px-8 py-4 text-base font-semibold sm:w-auto sm:px-10"
                style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
              >
                Log In
              </button>
            </Link>
            <Link href={`/gym/${encodeURIComponent(gym.code)}/signup`}>
              <button
                className="w-full rounded-full border px-8 py-4 text-base font-semibold sm:w-auto sm:px-10"
                style={{ borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.08)', color: 'var(--color-white)' }}
              >
                Join {gym.name}
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function GymLandingPage({ gym, isManagementPreview }: { gym: GymData; isManagementPreview?: boolean }) {
  const hasAmenities = !!gym.amenities && gym.amenities.length > 0;
  const hasSocial = !!gym.social_links && (!!gym.social_links.facebook || !!gym.social_links.instagram || !!gym.social_links.website);
  const hasContact = !!gym.address || !!gym.phone;
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());

  return (
    <>
      {isManagementPreview && (
        <div className="sticky top-0 z-50 border-b px-4 py-2 text-center text-sm font-semibold" style={{ backgroundColor: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)', color: 'var(--color-text-primary)' }}>
          Admin preview mode: this gym page is currently unpublished for public visitors.
        </div>
      )}
      <div className="relative flex flex-col min-h-screen md:hidden overflow-hidden">
        {gym.cover_url ? (
          <>
            <Image
              src={gym.cover_url}
              alt={gym.name}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0.92) 100%)',
              }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(145deg, var(--color-secondary), var(--color-primary-dark), var(--color-primary))' }}
          />
        )}

        <div className="relative z-10 flex justify-center pt-14">
          {gym.logo_url ? (
            <div className="h-16 w-16 overflow-hidden rounded-2xl border-2 border-white/70 shadow-lg">
              <Image
                src={gym.logo_url}
                alt={`${gym.name} logo`}
                width={64}
                height={64}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <span className="text-white text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                {gym.name.charAt(0)}
              </span>
            </div>
          )}
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/85"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Personal Training
          </p>
          <h1
            className="mt-2 text-4xl font-bold text-white leading-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {gym.name}
          </h1>
          {gym.tagline && (
            <p className="mt-3 text-base text-white/80 max-w-xs leading-relaxed">
              {gym.tagline}
            </p>
          )}
        </div>

        <div className="relative z-10 px-6 pb-12 space-y-3">
          <Link href={`/gym/${encodeURIComponent(gym.code)}/signup`} className="block">
            <button
              className="w-full py-4 rounded-xl text-base font-semibold uppercase tracking-[0.14em]"
              style={{
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-white)',
              }}
            >
              Create Account
            </button>
          </Link>
          <Link href={`/gym/${encodeURIComponent(gym.code)}/login?from=landing`} className="block">
            <button
              className="w-full py-4 rounded-xl border text-base font-semibold uppercase tracking-[0.14em]"
              style={{
                backgroundColor: 'rgba(0,0,0,0.28)',
                color: 'var(--color-white)',
                borderColor: 'rgba(255,255,255,0.3)',
              }}
            >
              Log In
            </button>
          </Link>
          <div className="pt-1 text-center">
            <Link
              href="/landing"
              className="text-xs font-medium underline-offset-4 hover:underline"
              style={{ color: 'rgba(255,255,255,0.72)' }}
            >
              Back to Stren
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden md:block">
      <header className="relative min-h-[90vh] overflow-hidden md:min-h-screen">
        {gym.cover_url ? (
          <>
            <Image src={gym.cover_url} alt={gym.name} fill className="object-cover" sizes="100vw" priority />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.65))' }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}
          />
        )}

        <div className="relative z-10 flex min-h-[90vh] items-end md:min-h-screen">
          <div className="w-full px-5 pb-14 sm:px-6 sm:pb-16 md:px-16 md:pb-24">
            <div className="max-w-4xl">
              {gym.logo_url && (
                <div
                  className="mb-6 h-16 w-16 overflow-hidden rounded-full border"
                  style={{ borderColor: 'rgba(255, 255, 255, 0.85)' }}
                >
                  <Image src={gym.logo_url} alt={`${gym.name} logo`} width={64} height={64} className="h-full w-full object-cover" />
                </div>
              )}

              <h1
                className="text-4xl font-bold leading-[0.95] tracking-tight sm:text-5xl md:text-7xl"
                style={{ color: 'var(--color-white)', fontFamily: 'var(--font-heading)' }}
              >
                {gym.name}
              </h1>

              {gym.tagline && (
                <p className="mt-3 max-w-xl text-lg sm:text-xl md:text-2xl" style={{ color: 'var(--color-white)', opacity: 0.8 }}>
                  {gym.tagline}
                </p>
              )}

              <div className="mt-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href={`/gym/${encodeURIComponent(gym.code)}/signup`}>
                    <button
                      className="w-full max-w-[90vw] truncate rounded-xl px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10"
                      style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
                    >
                      Join {gym.name}
                    </button>
                  </Link>
                  <Link href={`/gym/${encodeURIComponent(gym.code)}/login?from=landing`}>
                    <button
                      className="w-full max-w-[90vw] truncate rounded-xl border px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10"
                      style={{ borderColor: 'rgba(255,255,255,0.45)', color: 'var(--color-white)', backgroundColor: 'rgba(0,0,0,0.22)' }}
                    >
                      Login
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {gym.description && (
        <section style={{ backgroundColor: 'var(--color-white)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <div className="grid gap-10 md:grid-cols-5">
              <div className="md:col-span-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>
                  About
                </p>
                <h2
                  className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl"
                  style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
                >
                  Our Story
                </h2>
                <p className="mt-5 text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  {gym.description}
                </p>
              </div>

              <div className="md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>
                  Contact
                </p>
                <div className="mt-5 space-y-4">
                  {gym.address && (
                    <div className="flex items-start gap-3">
                      <MapPin size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {gym.address}
                      </p>
                    </div>
                  )}
                  {gym.phone && (
                    <div className="flex items-start gap-3">
                      <Phone size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        {gym.phone}
                      </p>
                    </div>
                  )}
                  {!hasContact && (
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      Contact details will be available soon.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {hasAmenities && (
        <section style={{ backgroundColor: 'var(--color-background)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>
              What We Offer
            </p>
            <h2
              className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
            >
              Amenities
            </h2>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {gym.amenities?.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                  style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
                >
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-primary)' }} />
                  <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {gym.operating_hours && (
        <section style={{ backgroundColor: 'var(--color-white)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>
              Hours
            </p>
            <h2
              className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
            >
              Open Every Day for Your Training
            </h2>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-7">
              {DAY_ORDER.map((day) => {
                const hours = gym.operating_hours?.[day] || 'Closed';
                const isClosed = hours === 'Closed';
                const isToday = day === today;

                return (
                  <div
                    key={day}
                    className="rounded-2xl border p-5 text-center"
                    style={{
                      borderColor: isToday ? 'var(--color-primary)' : 'var(--color-surface)',
                      opacity: isClosed ? 0.5 : 1,
                    }}
                  >
                    <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-muted)' }}>
                      {day}
                    </p>
                    <p
                      className="mt-1 text-sm font-semibold"
                      style={{ color: isToday ? 'var(--color-primary)' : 'var(--color-text-primary)' }}
                    >
                      {hours}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {gym.address && (
        <section style={{ backgroundColor: 'var(--color-background)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>
              Find Us
            </p>
            <h2
              className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
            >
              Come Train With Us
            </h2>

            <p className="mt-6 text-lg sm:text-xl" style={{ color: 'var(--color-text-secondary)' }}>
              {gym.address}
            </p>

            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gym.address)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-base font-medium"
              style={{ color: 'var(--color-primary)' }}
            >
              Get directions -&gt;
            </a>

            <div className="mt-8 h-2 w-16 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
          </div>
        </section>
      )}

      {hasSocial && (
        <section style={{ backgroundColor: 'var(--color-white)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>
              Connect
            </p>
            <h2
              className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl"
              style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
            >
              Stay Connected
            </h2>

            <div className="mt-8 flex flex-wrap gap-3">
              {gym.social_links?.facebook && (
                <a
                  href={gym.social_links.facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-(--color-surface) bg-white px-6 py-3 text-sm font-medium text-(--color-text-primary) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) sm:w-auto sm:px-8"
                  style={{ borderWidth: '1.5px' }}
                >
                  <Facebook size={18} /> Facebook
                </a>
              )}

              {gym.social_links?.instagram && (
                <a
                  href={gym.social_links.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-(--color-surface) bg-white px-6 py-3 text-sm font-medium text-(--color-text-primary) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) sm:w-auto sm:px-8"
                  style={{ borderWidth: '1.5px' }}
                >
                  <Instagram size={18} /> Instagram
                </a>
              )}

              {gym.social_links?.website && (
                <a
                  href={gym.social_links.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-(--color-surface) bg-white px-6 py-3 text-sm font-medium text-(--color-text-primary) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) sm:w-auto sm:px-8"
                  style={{ borderWidth: '1.5px' }}
                >
                  <Globe size={18} /> Website
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section style={{ background: 'linear-gradient(130deg, var(--color-secondary), var(--color-primary))' }}>
        <div className="mx-auto max-w-5xl px-6 py-20 text-center md:px-16 md:py-28">
          <h2
            className="text-3xl font-bold sm:text-4xl md:text-5xl"
            style={{ color: 'var(--color-white)', fontFamily: 'var(--font-heading)' }}
          >
            Ready to start?
          </h2>
          <p className="mt-3 text-lg sm:text-xl" style={{ color: 'var(--color-white)', opacity: 0.8 }}>
            Join {gym.name} today.
          </p>

          <div className="mt-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <Link href={`/gym/${encodeURIComponent(gym.code)}/signup`}>
                <button
                  className="w-full max-w-[90vw] truncate rounded-xl px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
                >
                  Join {gym.name}
                </button>
              </Link>
              <Link href={`/gym/${encodeURIComponent(gym.code)}/login?from=landing`}>
                <button
                  className="w-full max-w-[90vw] truncate rounded-xl border px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10"
                  style={{ borderColor: 'rgba(255,255,255,0.7)', color: 'var(--color-white)', backgroundColor: 'rgba(0,0,0,0.18)' }}
                >
                  Login
                </button>
              </Link>
            </div>
            <div className="mt-5 text-center">
              <Link
                href="/landing"
                className="text-sm font-medium underline-offset-4 hover:underline"
                style={{ color: 'rgba(255,255,255,0.8)' }}
              >
                Back to Stren
              </Link>
            </div>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}

async function canCurrentUserPreviewUnpublishedGym(gymId: string): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, gym_id')
      .eq('id', userData.user.id)
      .maybeSingle();

    return canPreviewUnpublishedGym(gymId, {
      role: profile?.role,
      gymId: profile?.gym_id,
    });
  } catch {
    return false;
  }
}

function toOperatingHours(value: Json | null): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, Json | undefined>;
  const output: Record<string, string> = {};

  for (const day of DAY_ORDER) {
    const raw = source[day];
    if (typeof raw === 'string') output[day] = raw;
  }

  return Object.keys(output).length > 0 ? output : null;
}

function toSocialLinks(value: Json | null): { facebook?: string; instagram?: string; website?: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, Json | undefined>;

  const social: { facebook?: string; instagram?: string; website?: string } = {};
  if (typeof source.facebook === 'string' && source.facebook.trim()) social.facebook = source.facebook;
  if (typeof source.instagram === 'string' && source.instagram.trim()) social.instagram = source.instagram;
  if (typeof source.website === 'string' && source.website.trim()) social.website = source.website;

  return Object.keys(social).length > 0 ? social : null;
}

function normalizeStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const marker = '/storage/v1/object/public/gym-assets/';
  const markerIndex = trimmed.indexOf(marker);

  const rawPath = markerIndex >= 0
    ? trimmed.slice(markerIndex + marker.length)
    : trimmed;

  const withoutQuery = rawPath.split('?')[0];
  const normalized = withoutQuery.replace(/^\/+/, '');

  return normalized || null;
}
