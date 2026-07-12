import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGymAssetPublicUrl, getGymPublicByCode } from '@/lib/gym-public';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { canPreviewUnpublishedGym, type GymViewerRole } from '@/lib/gym-visibility';
import { GymLandingPreview, type GymPreviewData } from '@/components/gym/GymLandingPreview';
import { normalizeFocal } from '@/lib/focal';
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
    cover_focal?: unknown;
    section_visibility?: unknown;
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

  const preview: GymPreviewData = {
    name: gym.name,
    code: gym.code,
    tagline: gym.tagline,
    description: gym.description,
    address: gym.address,
    phone: gym.phone,
    logoUrl: gym.logo_url,
    coverUrl: gym.cover_url,
    brandColor: gym.brand_color,
    secondaryColor: gym.secondary_color ?? null,
    operatingHours: gym.operating_hours,
    amenities: gym.amenities,
    socialLinks: gym.social_links,
    // Home view does not render these; subpages carry their own data.
    teamMembers: null,
    pricingPackages: null,
    mapEmbedUrl: null,
    directions: null,
    memberCount: gym.member_count,
    coverFocal: normalizeFocal(rpcData.cover_focal),
    sectionVisibility: toSectionVisibility(rpcData.section_visibility),
  };

  return <GymLandingPage preview={preview} isManagementPreview={!gym.is_published && canManagementPreview} />;
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

function GymLandingPage({ preview, isManagementPreview }: { preview: GymPreviewData; isManagementPreview?: boolean }) {
  return (
    <>
      {isManagementPreview && (
        <div className="sticky top-0 z-50 border-b px-4 py-2 text-center text-sm font-semibold" style={{ backgroundColor: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)', color: 'var(--color-text-primary)' }}>
          Admin preview mode: this gym page is currently unpublished for public visitors.
        </div>
      )}
      <GymLandingPreview gym={preview} view="home" interactive />
    </>
  );
}

function toSectionVisibility(value: unknown): { amenities: boolean; hours: boolean; contact: boolean } {
  const fallback = { amenities: true, hours: true, contact: true };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const src = value as Record<string, unknown>;
  return {
    amenities: typeof src.amenities === 'boolean' ? src.amenities : true,
    hours: typeof src.hours === 'boolean' ? src.hours : true,
    contact: typeof src.contact === 'boolean' ? src.contact : true,
  };
}

async function canCurrentUserPreviewUnpublishedGym(gymId: string): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return false;

    const { data: access } = await supabase.rpc('get_my_access');
    const resolved = access as { role?: string; gym_id?: string | null } | null;

    return canPreviewUnpublishedGym(gymId, {
      role: resolved?.role as GymViewerRole,
      gymId: resolved?.gym_id,
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
