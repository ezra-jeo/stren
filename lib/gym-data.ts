import type { Json } from './database.types';
import type { GymPreviewData } from '@/components/gym/GymLandingPreview';
import { normalizeFocal } from './focal';

export type TeamMember = {
  name: string;
  role: string;
  bio?: string;
  photo_url?: string;
};

export type PricingPackage = {
  name: string;
  price: string;
  duration: string;
  features: string[];
  is_featured?: boolean;
};

export type GymPageData = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  brand_color: string;
  operating_hours: Record<string, string> | null;
  amenities: string[] | null;
  social_links: { facebook?: string; instagram?: string; website?: string } | null;
  team_members: TeamMember[] | null;
  pricing_packages: PricingPackage[] | null;
  map_embed_url: string | null;
  directions: string | null;
  member_count: number;
  is_published: boolean;
};

type JsonObject = { [key: string]: Json | undefined };

function isJsonObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toTeamMembers(value: Json | null): TeamMember[] | null {
  if (!Array.isArray(value)) return null;

  return value
    .filter((v): v is JsonObject => isJsonObject(v))
    .map((v) => ({
      name: typeof v.name === 'string' ? v.name : '',
      role: typeof v.role === 'string' ? v.role : '',
      bio: typeof v.bio === 'string' ? v.bio : undefined,
      photo_url: typeof v.photo_url === 'string' ? v.photo_url : undefined,
    }))
    .filter((m) => m.name);
}

export function toPricingPackages(value: Json | null): PricingPackage[] | null {
  if (!Array.isArray(value)) return null;

  return value
    .filter((v): v is JsonObject => isJsonObject(v))
    .map((v) => ({
      name: typeof v.name === 'string' ? v.name : '',
      price: typeof v.price === 'string' ? v.price : '',
      duration: typeof v.duration === 'string' ? v.duration : '',
      features: Array.isArray(v.features)
        ? v.features.filter((f): f is string => typeof f === 'string')
        : [],
      is_featured: typeof v.is_featured === 'boolean' ? v.is_featured : false,
    }))
    .filter((p) => p.name);
}

function toOperatingHoursRecord(value: Json | null): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const src = value as Record<string, Json | undefined>;
  const out: Record<string, string> = {};
  for (const [day, raw] of Object.entries(src)) {
    if (typeof raw === 'string') out[day] = raw;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function toSocialLinksRecord(value: Json | null): { facebook?: string; instagram?: string; website?: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const src = value as Record<string, Json | undefined>;
  const social: { facebook?: string; instagram?: string; website?: string } = {};
  if (typeof src.facebook === 'string' && src.facebook.trim()) social.facebook = src.facebook;
  if (typeof src.instagram === 'string' && src.instagram.trim()) social.instagram = src.instagram;
  if (typeof src.website === 'string' && src.website.trim()) social.website = src.website;
  return Object.keys(social).length > 0 ? social : null;
}

function toSectionVisibilityRecord(value: Json | null): { amenities: boolean; hours: boolean; contact: boolean } {
  const fallback = { amenities: true, hours: true, contact: true };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const src = value as Record<string, Json | undefined>;
  return {
    amenities: typeof src.amenities === 'boolean' ? src.amenities : true,
    hours: typeof src.hours === 'boolean' ? src.hours : true,
    contact: typeof src.contact === 'boolean' ? src.contact : true,
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Map a `get_gym_by_code` payload into the prop shape `GymLandingPreview` needs
 * (ImplementationPlan.md §7.1). Used by the public subpages so they render the
 * same component as the Studio preview.
 */
export function toGymPreviewData(data: Record<string, unknown>): GymPreviewData {
  const pricing = toPricingPackages((data.pricing_packages as Json | undefined) ?? null);
  return {
    name: str(data.name),
    code: str(data.code),
    tagline: strOrNull(data.tagline),
    description: strOrNull(data.description),
    address: strOrNull(data.address),
    phone: strOrNull(data.phone),
    logoUrl: strOrNull(data.logo_url),
    coverUrl: strOrNull(data.cover_url),
    brandColor: str(data.brand_color) || '#D4956A',
    secondaryColor: strOrNull(data.secondary_color),
    operatingHours: toOperatingHoursRecord((data.operating_hours as Json | undefined) ?? null),
    amenities: Array.isArray(data.amenities)
      ? (data.amenities as unknown[]).filter((a): a is string => typeof a === 'string')
      : null,
    socialLinks: toSocialLinksRecord((data.social_links as Json | undefined) ?? null),
    teamMembers: toTeamMembers((data.team_members as Json | undefined) ?? null),
    pricingPackages: pricing
      ? pricing.map((p) => ({ ...p, is_featured: !!p.is_featured }))
      : null,
    mapEmbedUrl: strOrNull(data.map_embed_url),
    directions: strOrNull(data.directions),
    memberCount: typeof data.member_count === 'number' ? data.member_count : 0,
    coverFocal: normalizeFocal(data.cover_focal),
    sectionVisibility: toSectionVisibilityRecord((data.section_visibility as Json | undefined) ?? null),
  };
}
