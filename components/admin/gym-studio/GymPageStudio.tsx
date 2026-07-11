'use client';

/**
 * Gym Page Studio — client island (ImplementationPlan.md §7.2–§7.10).
 *
 * Owns ALL state + the save/upload/compress/hash/cleanup/revalidate pipeline,
 * lifted verbatim from the old `app/admin/gym-profile/page.tsx`. The Studio is a
 * UI around that pipeline, not a rewrite. State + actions are exposed through a
 * context so the presentational rail/preview/header pieces stay dumb and testable.
 *
 * In this phase the file it replaces stays a client page that renders <GymPageStudio/>.
 * Agent B later converts that page to a server wrapper passing
 * { initialGym, access, initialFeatureFlags } — hence the optional props here.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { isValidHex } from '@/lib/brand-color';
import { useAccess } from '@/lib/access-context';
import type { MyAccess } from '@/lib/access';
import { saveFeatureFlags } from '@/lib/access-data';
import { FEATURE_CATALOG, isFeatureEnabled, type FeatureFlags, type FeatureKey } from '@/lib/features';
import { clampFocal, normalizeFocal, nudgeFocal, type FocalPoint } from '@/lib/focal';
import type { GymPreviewData, GymPreviewView } from '@/components/gym/GymLandingPreview';
import { toast } from 'sonner';
import { PageSkeleton } from '@/components/ui/loading-screen';
import { StudioLayout } from './StudioLayout';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const MAX_ASSET_VERSIONS_PER_KIND = 8;
const SAVE_TIMEOUT_MS = 15000;
const HASH_TIMEOUT_MS = 5000;
const COMPRESS_TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 90000;
const CLEANUP_DELAY_MS = 30000;
const CLEANUP_LIST_TIMEOUT_MS = 20000;
const CLEANUP_REMOVE_TIMEOUT_MS = 30000;
const REVALIDATE_TIMEOUT_MS = 8000;
const GYM_PROFILE_LOAD_TIMEOUT_MS = 10000;

// Load selects, widest → narrowest. Tier (b) keeps is_published + secondary_color
// (so a published gym never regresses to "Hidden" when the DB is behind the app),
// dropping only the migration-017 Studio-meta columns.
const GYM_SELECT_FULL =
  'id, name, code, is_published, tagline, description, brand_color, secondary_color, logo_url, cover_url, logo_path, cover_path, address, phone, operating_hours, amenities, social_links, team_members, pricing_packages, map_embed_url, directions, cover_focal, section_visibility';
const GYM_SELECT_WITHOUT_STUDIO_META =
  'id, name, code, is_published, tagline, description, brand_color, secondary_color, logo_url, cover_url, logo_path, cover_path, address, phone, operating_hours, amenities, social_links, team_members, pricing_packages, map_embed_url, directions';
const GYM_SELECT_LEGACY =
  'id, name, code, tagline, description, brand_color, logo_url, cover_url, logo_path, cover_path, address, phone, operating_hours, amenities, social_links, team_members, pricing_packages, map_embed_url, directions';

type HoursState = Record<(typeof DAYS)[number], string>;
type SocialState = { facebook: string; instagram: string; website: string };
type TeamMemberForm = { name: string; role: string; bio: string; photo_url: string };
type PricingPackageForm = { name: string; price: string; duration: string; features: string; is_featured: boolean };

type GymProfileRow = {
  id: string;
  name: string;
  code: string;
  is_published?: boolean | null;
  tagline: string | null;
  description: string | null;
  brand_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  cover_url: string | null;
  logo_path: string | null;
  cover_path: string | null;
  address: string | null;
  phone: string | null;
  operating_hours: unknown;
  amenities: string[] | null;
  social_links: unknown;
  team_members: unknown;
  pricing_packages: unknown;
  map_embed_url: string | null;
  directions: string | null;
  cover_focal?: unknown;
  section_visibility?: unknown;
};

export type StudioGroupKey = 'essentials' | 'photos' | 'brand' | 'sections' | 'subpages' | 'features';
type SectionVisibility = { amenities: boolean; hours: boolean; contact: boolean };

function emptyHours(): HoursState {
  return { Monday: '', Tuesday: '', Wednesday: '', Thursday: '', Friday: '', Saturday: '', Sunday: '' };
}

// ── Media pipeline helpers (lifted verbatim from gym-profile/page.tsx) ─────────

async function blobHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getAssetKindFromName(name: string): 'logo' | 'cover' | null {
  if (name.startsWith('logo-') && name.endsWith('.jpg')) return 'logo';
  if (name.startsWith('cover-') && name.endsWith('.jpg')) return 'cover';
  return null;
}

function withTimeout<T>(promiseLike: PromiseLike<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    Promise.resolve(promiseLike).then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function retryOnBenignLock<T>(operation: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const benign = message.includes('lock broken by another request') && message.includes('steal');
      if (!benign || attempt === retries) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }
  throw lastError ?? new Error('Unknown lock error');
}

// ── Studio state hook ─────────────────────────────────────────────────────────

type GymPageStudioProps = {
  initialGym?: GymProfileRow | null;
  access?: MyAccess;
  initialFeatureFlags?: FeatureFlags;
};

function useStudioState(props: GymPageStudioProps) {
  const { profile } = useAuth();
  const accessFromContext = useAccess();
  const access = props.access ?? accessFromContext;
  const supabase = useMemo(() => createClient(), []);

  const gymId = profile?.gymId ?? props.initialGym?.id ?? null;

  const fileSignatureCacheRef = useRef(new Map<string, { path: string; url: string }>());
  const hashAssetCacheRef = useRef(new Map<string, { path: string; url: string }>());
  const cleanupTimerRef = useRef<number | null>(null);
  const cleanupInProgressRef = useRef(false);
  const isSavingRef = useRef(false);
  const isUploadingLogoRef = useRef(false);
  const isUploadingCoverRef = useRef(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const [isLoading, setIsLoading] = useState(!props.initialGym);
  // Whether the migration-017 Studio-meta columns exist. Flipped false only when a
  // load has to fall back past the full select — gates the save payload (Fix 1).
  const [studioMetaColumnsAvailable, setStudioMetaColumnsAvailable] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);

  const [gymName, setGymName] = useState('');
  const [gymCode, setGymCode] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [tagline, setTaglineState] = useState('');
  const [description, setDescriptionState] = useState('');
  const [brandColor, setBrandColorState] = useState('#D4956A');
  const [brandColorError, setBrandColorError] = useState('');
  const [secondaryColor, setSecondaryColorState] = useState('#2C2C2C');
  const [secondaryColorError, setSecondaryColorError] = useState('');

  const [logoPath, setLogoPath] = useState('');
  const [coverPath, setCoverPath] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [operatingHours, setOperatingHours] = useState<HoursState>(emptyHours());

  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenityInput, setAmenityInput] = useState('');
  const [address, setAddressState] = useState('');
  const [phone, setPhoneState] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialState>({ facebook: '', instagram: '', website: '' });

  const [teamMembers, setTeamMembers] = useState<TeamMemberForm[]>([]);
  const [pricingPackages, setPricingPackages] = useState<PricingPackageForm[]>([]);
  const [mapEmbedUrl, setMapEmbedUrlState] = useState('');
  const [directions, setDirectionsState] = useState('');

  const [coverFocal, setCoverFocal] = useState<FocalPoint>({ x: 50, y: 50 });
  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>({ amenities: true, hours: true, contact: true });

  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(props.initialFeatureFlags ?? access.features);
  const [featureFlagsDirty, setFeatureFlagsDirty] = useState(false);

  const [previewTab, setPreviewTab] = useState<GymPreviewView>('home');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [focalEditing, setFocalEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [openGroups, setOpenGroups] = useState<Record<StudioGroupKey, boolean>>({
    essentials: true, photos: true, brand: false, sections: false, subpages: false, features: false,
  });

  const hasTagline = tagline.trim().length > 0;
  const canPublish = access.permissions.has('gym_page:publish');
  const canManageFeatures = access.permissions.has('features:manage');

  const markDirty = useCallback(() => setDirty(true), []);

  // Keep feature flags in sync with resolved access until the owner edits them.
  useEffect(() => {
    if (props.initialFeatureFlags) return;
    if (featureFlagsDirty) return;
    setFeatureFlags(access.features);
  }, [access.features, featureFlagsDirty, props.initialFeatureFlags]);

  // ── Loading ────────────────────────────────────────────────────────────────

  const applyRow = useCallback((data: GymProfileRow) => {
    setGymName(data.name ?? '');
    setGymCode(data.code ?? '');
    setIsPublished(!!data.is_published);
    setTaglineState(data.tagline ?? '');
    setDescriptionState(data.description ?? '');
    setBrandColorState(data.brand_color && isValidHex(data.brand_color) ? data.brand_color : '#D4956A');
    setSecondaryColorState(data.secondary_color && isValidHex(data.secondary_color) ? data.secondary_color : '#2C2C2C');
    setLogoPath(data.logo_path ?? '');
    setCoverPath(data.cover_path ?? '');
    setAddressState(data.address ?? '');
    setPhoneState(data.phone ?? '');
    setMapEmbedUrlState(data.map_embed_url ?? '');
    setDirectionsState(data.directions ?? '');
    setAmenities(data.amenities ?? []);
    setCoverFocal(normalizeFocal(data.cover_focal));
    setSectionVisibility(toSectionVisibility(data.section_visibility));

    const nextHours = emptyHours();
    if (data.operating_hours && typeof data.operating_hours === 'object' && !Array.isArray(data.operating_hours)) {
      const src = data.operating_hours as Record<string, unknown>;
      for (const day of DAYS) {
        const value = src[day];
        nextHours[day] = typeof value === 'string' ? value : '';
      }
    }
    setOperatingHours(nextHours);

    if (data.social_links && typeof data.social_links === 'object' && !Array.isArray(data.social_links)) {
      const src = data.social_links as Record<string, unknown>;
      setSocialLinks({
        facebook: typeof src.facebook === 'string' ? src.facebook : '',
        instagram: typeof src.instagram === 'string' ? src.instagram : '',
        website: typeof src.website === 'string' ? src.website : '',
      });
    }

    if (Array.isArray(data.team_members)) {
      setTeamMembers(
        (data.team_members as Record<string, unknown>[]).map((m) => ({
          name: typeof m.name === 'string' ? m.name : '',
          role: typeof m.role === 'string' ? m.role : '',
          bio: typeof m.bio === 'string' ? m.bio : '',
          photo_url: typeof m.photo_url === 'string' ? m.photo_url : '',
        })),
      );
    }

    if (Array.isArray(data.pricing_packages)) {
      setPricingPackages(
        (data.pricing_packages as Record<string, unknown>[]).map((p) => ({
          name: typeof p.name === 'string' ? p.name : '',
          price: typeof p.price === 'string' ? p.price : '',
          duration: typeof p.duration === 'string' ? p.duration : '',
          features: Array.isArray(p.features) ? (p.features as unknown[]).filter((f): f is string => typeof f === 'string').join('\n') : '',
          is_featured: typeof p.is_featured === 'boolean' ? p.is_featured : false,
        })),
      );
    }
  }, []);

  function getPublicAssetUrl(path: string) {
    const { data } = supabase.storage.from('gym-assets').getPublicUrl(path);
    return data.publicUrl;
  }

  const loadGym = useCallback(
    async (id: string) => {
      setIsLoading(true);
      try {
        const selectGym = (columns: string, timeoutMessage: string) =>
          retryOnBenignLock(() =>
            withTimeout(
              supabase.from('gyms').select(columns).eq('id', id).maybeSingle(),
              GYM_PROFILE_LOAD_TIMEOUT_MS,
              timeoutMessage,
            ),
          );

        // Tier (a): full select including the migration-017 Studio-meta columns.
        const primary = await selectGym(GYM_SELECT_FULL, 'Gym profile load timed out.');
        let data = primary.data as GymProfileRow | null;
        let metaColumnsAvailable = true;

        if (primary.error) {
          // Tier (b): DB is behind the app (e.g. 017 rolled back). Retry without the
          // two Studio-meta columns but KEEP is_published + secondary_color.
          const withoutMeta = await selectGym(GYM_SELECT_WITHOUT_STUDIO_META, 'Gym profile fallback load timed out.');
          if (!withoutMeta.error && withoutMeta.data) {
            metaColumnsAvailable = false;
            data = withoutMeta.data as unknown as GymProfileRow;
          } else {
            // Tier (c): legacy fallback (also predates is_published/secondary_color).
            const legacy = await selectGym(GYM_SELECT_LEGACY, 'Gym profile fallback load timed out.');
            if (legacy.error || !legacy.data) {
              toast.error('Unable to load gym profile.');
              return;
            }
            metaColumnsAvailable = false;
            data = legacy.data as unknown as GymProfileRow;
          }
        }

        if (!data) {
          toast.error('Unable to load gym profile.');
          return;
        }

        setStudioMetaColumnsAvailable(metaColumnsAvailable);
        applyRow(data);

        if (data.logo_path) {
          const { data: logoPublic } = supabase.storage.from('gym-assets').getPublicUrl(data.logo_path);
          setLogoUrl(logoPublic.publicUrl);
        } else {
          setLogoUrl(data.logo_url ?? '');
        }
        if (data.cover_path) {
          const { data: coverPublic } = supabase.storage.from('gym-assets').getPublicUrl(data.cover_path);
          setCoverUrl(coverPublic.publicUrl);
        } else {
          setCoverUrl(data.cover_url ?? '');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown load error.';
        toast.error(`Unable to load gym profile: ${message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [applyRow, supabase],
  );

  useEffect(() => {
    if (props.initialGym) {
      applyRow(props.initialGym);
      if (props.initialGym.logo_path) setLogoUrl(getPublicAssetUrl(props.initialGym.logo_path));
      else setLogoUrl(props.initialGym.logo_url ?? '');
      if (props.initialGym.cover_path) setCoverUrl(getPublicAssetUrl(props.initialGym.cover_path));
      else setCoverUrl(props.initialGym.cover_url ?? '');
      setIsLoading(false);
      return;
    }
    if (gymId) void loadGym(gymId);
    else setIsLoading(false);
  }, [gymId]);

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) window.clearTimeout(cleanupTimerRef.current);
    };
  }, []);

  // ── Media pipeline (lifted verbatim) ─────────────────────────────────────────

  function buildAssetSignature(file: File, kind: 'logo' | 'cover') {
    return `${kind}:${file.name}:${file.size}:${file.type}:${file.lastModified}`;
  }

  function extractHashFromPath(path: string, kind: 'logo' | 'cover') {
    const fileName = path.split('/').pop() ?? '';
    const prefix = `${kind}-`;
    if (!fileName.startsWith(prefix) || !fileName.endsWith('.jpg')) return null;
    return fileName.slice(prefix.length, -4);
  }

  function removeCachedAssetPath(path: string) {
    for (const [key, value] of fileSignatureCacheRef.current.entries()) {
      if (value.path === path) fileSignatureCacheRef.current.delete(key);
    }
    for (const [key, value] of hashAssetCacheRef.current.entries()) {
      if (value.path === path) hashAssetCacheRef.current.delete(key);
    }
  }

  function applyAsset(kind: 'logo' | 'cover', path: string, url: string) {
    if (kind === 'logo') {
      setLogoPath(path);
      setLogoUrl(url);
    } else {
      setCoverPath(path);
      setCoverUrl(url);
    }
    markDirty();
  }

  function rememberAsset(kind: 'logo' | 'cover', path: string, url: string, signature?: string) {
    if (signature) fileSignatureCacheRef.current.set(signature, { path, url });
    const hash = extractHashFromPath(path, kind);
    if (hash) hashAssetCacheRef.current.set(`${kind}:${hash}`, { path, url });
  }

  async function compressImage(file: File, kind: 'logo' | 'cover'): Promise<{ blob: Blob }> {
    const maxWidth = kind === 'logo' ? 400 : 1920;
    const maxHeight = kind === 'logo' ? 400 : 1080;
    const quality = kind === 'logo' ? 0.9 : 0.82;

    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression failed'));
              return;
            }
            resolve({ blob });
          },
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });
  }

  async function uploadAsset(file: File, kind: 'logo' | 'cover') {
    if (!gymId) return;
    if (kind === 'logo') {
      setIsUploadingLogo(true);
      isUploadingLogoRef.current = true;
    }
    if (kind === 'cover') {
      setIsUploadingCover(true);
      isUploadingCoverRef.current = true;
    }
    try {
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload a valid image file.');
        return;
      }
      const maxBytes = 8 * 1024 * 1024;
      if (file.size > maxBytes) {
        toast.error('Image is too large. Please keep files under 8MB.');
        return;
      }

      const signature = buildAssetSignature(file, kind);
      const cachedBySignature = fileSignatureCacheRef.current.get(signature);
      if (cachedBySignature) {
        applyAsset(kind, cachedBySignature.path, cachedBySignature.url);
        toast.success(`${kind === 'logo' ? 'Logo' : 'Cover image'} loaded instantly`);
        return;
      }

      let hash: string;
      try {
        hash = await withTimeout(blobHash(file), HASH_TIMEOUT_MS, 'Hashing image timed out.');
      } catch {
        hash = `${file.size.toString(16)}${file.lastModified.toString(16)}`;
      }

      const fileName = `${kind}-${hash}.jpg`;
      const newPath = `${gymId}/${fileName}`;
      const existingPath = kind === 'logo' ? logoPath : coverPath;

      if (existingPath === newPath) {
        const currentUrl = kind === 'logo' ? logoUrl : coverUrl;
        if (currentUrl) {
          rememberAsset(kind, newPath, currentUrl, signature);
          toast.success(`${kind === 'logo' ? 'Logo' : 'Cover image'} already selected`);
          return;
        }
      }

      const cachedByHash = hashAssetCacheRef.current.get(`${kind}:${hash}`);
      if (cachedByHash) {
        applyAsset(kind, cachedByHash.path, cachedByHash.url);
        rememberAsset(kind, cachedByHash.path, cachedByHash.url, signature);
        toast.success(`${kind === 'logo' ? 'Logo' : 'Cover image'} loaded instantly`);
        return;
      }

      let uploadBlob: Blob = file;
      const isAlreadyJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
      const shouldCompress = !isAlreadyJpeg || file.size > 2 * 1024 * 1024;
      if (shouldCompress) {
        try {
          const compressed = await withTimeout(compressImage(file, kind), COMPRESS_TIMEOUT_MS, 'Image compression timed out.');
          uploadBlob = compressed.blob;
        } catch {
          // Compression failed — upload original.
        }
      }

      const { error } = await withTimeout(
        supabase.storage.from('gym-assets').upload(newPath, uploadBlob, { upsert: true, contentType: 'image/jpeg' }),
        UPLOAD_TIMEOUT_MS,
        'Upload request timed out. Please try again.',
      );
      if (error) {
        toast.error(`Failed to upload ${kind}: ${error.message}`);
        return;
      }

      const publicUrl = getPublicAssetUrl(newPath);
      applyAsset(kind, newPath, publicUrl);
      rememberAsset(kind, newPath, publicUrl, signature);
      toast.success(`${kind === 'logo' ? 'Logo' : 'Cover image'} uploaded`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown upload error.';
      toast.error(`Failed to upload ${kind}: ${message}`);
    } finally {
      if (kind === 'logo') {
        setIsUploadingLogo(false);
        isUploadingLogoRef.current = false;
      }
      if (kind === 'cover') {
        setIsUploadingCover(false);
        isUploadingCoverRef.current = false;
      }
    }
  }

  function resetAsset(kind: 'logo' | 'cover') {
    if (kind === 'logo') {
      setLogoPath('');
      setLogoUrl('');
    } else {
      setCoverPath('');
      setCoverUrl('');
      setFocalEditing(false);
    }
    markDirty();
  }

  function handleAssetSelection(file: File | undefined, kind: 'logo' | 'cover') {
    if (!file) return;
    void uploadAsset(file, kind);
  }

  async function cleanupStaleGymAssets(id: string, currentLogoPath: string | null, currentCoverPath: string | null) {
    try {
      const { data: listed, error } = await withTimeout(
        supabase.storage.from('gym-assets').list(id, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } }),
        CLEANUP_LIST_TIMEOUT_MS,
        'Cleanup list timed out.',
      );
      if (error || !listed || listed.length === 0) return;

      const grouped: Record<'logo' | 'cover', string[]> = { logo: [], cover: [] };
      for (const entry of listed) {
        const kind = getAssetKindFromName(entry.name);
        if (!kind) continue;
        grouped[kind].push(`${id}/${entry.name}`);
      }

      const toRemove: string[] = [];
      for (const kind of ['logo', 'cover'] as const) {
        const currentPath = kind === 'logo' ? currentLogoPath : currentCoverPath;
        let kept = 0;
        for (const path of grouped[kind]) {
          if (path === currentPath) {
            kept += 1;
            continue;
          }
          if (kept < MAX_ASSET_VERSIONS_PER_KIND) {
            kept += 1;
            continue;
          }
          toRemove.push(path);
        }
      }
      if (toRemove.length === 0) return;

      const { error: removeError } = await withTimeout(
        supabase.storage.from('gym-assets').remove(toRemove),
        CLEANUP_REMOVE_TIMEOUT_MS,
        'Cleanup remove timed out.',
      );
      if (removeError) {
        console.error('Failed to clean old gym assets:', removeError.message);
        return;
      }
      for (const removedPath of toRemove) removeCachedAssetPath(removedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Cleanup list timed out.' || message === 'Cleanup remove timed out.') return;
      console.error('Failed to clean old gym assets:', error);
    }
  }

  function scheduleStaleAssetCleanup(id: string, currentLogoPath: string | null, currentCoverPath: string | null) {
    if (cleanupTimerRef.current) window.clearTimeout(cleanupTimerRef.current);
    cleanupTimerRef.current = window.setTimeout(() => {
      if (cleanupInProgressRef.current) return;
      if (isSavingRef.current || isUploadingLogoRef.current || isUploadingCoverRef.current) {
        scheduleStaleAssetCleanup(id, currentLogoPath, currentCoverPath);
        return;
      }
      cleanupInProgressRef.current = true;
      void (async () => {
        try {
          await cleanupStaleGymAssets(id, currentLogoPath, currentCoverPath);
        } finally {
          cleanupInProgressRef.current = false;
          cleanupTimerRef.current = null;
        }
      })();
    }, CLEANUP_DELAY_MS);
  }

  async function triggerGymPageRevalidation(code: string) {
    if (!code) return;
    try {
      const response = await withTimeout(
        fetch('/api/admin/revalidate-gym', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code }),
        }),
        REVALIDATE_TIMEOUT_MS,
        'Gym page revalidation timed out.',
      );
      if (!response.ok) {
        const details = await response.text();
        console.error('Failed to revalidate gym pages:', details);
      }
    } catch (error) {
      console.error('Failed to revalidate gym pages:', error);
    }
  }

  // ── Field actions ────────────────────────────────────────────────────────────

  const setTagline = (v: string) => { setTaglineState(v); markDirty(); };
  const setDescription = (v: string) => { setDescriptionState(v); markDirty(); };
  const setAddress = (v: string) => { setAddressState(v); markDirty(); };
  const setPhone = (v: string) => { setPhoneState(v); markDirty(); };
  const setMapEmbedUrl = (v: string) => { setMapEmbedUrlState(v); markDirty(); };
  const setDirections = (v: string) => { setDirectionsState(v); markDirty(); };
  const setBrandColor = (v: string) => { setBrandColorState(v); setBrandColorError(''); markDirty(); };
  const setSecondaryColor = (v: string) => { setSecondaryColorState(v); setSecondaryColorError(''); markDirty(); };

  function togglePublish() {
    if (!isPublished && !hasTagline) {
      toast.error('Add a tagline before publishing your gym page.');
      return;
    }
    setIsPublished((prev) => !prev);
    markDirty();
  }

  function toggleSection(key: keyof SectionVisibility) {
    setSectionVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
    markDirty();
  }

  function setSocial(key: keyof SocialState, value: string) {
    setSocialLinks((prev) => ({ ...prev, [key]: value }));
    markDirty();
  }

  function setHour(day: (typeof DAYS)[number], value: string) {
    setOperatingHours((prev) => ({ ...prev, [day]: value }));
    markDirty();
  }

  function addAmenity() {
    const value = amenityInput.trim();
    if (!value) return;
    if (amenities.includes(value)) {
      setAmenityInput('');
      return;
    }
    setAmenities((prev) => [...prev, value]);
    setAmenityInput('');
    markDirty();
  }

  function removeAmenity(value: string) {
    setAmenities((prev) => prev.filter((item) => item !== value));
    markDirty();
  }

  function addTeamMember() {
    setTeamMembers((prev) => [...prev, { name: '', role: '', bio: '', photo_url: '' }]);
    markDirty();
  }
  function removeTeamMember(index: number) {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }
  function updateTeamMember(index: number, key: keyof TeamMemberForm, value: string) {
    setTeamMembers((prev) => prev.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
    markDirty();
  }

  function addPricingPackage() {
    setPricingPackages((prev) => [...prev, { name: '', price: '', duration: '', features: '', is_featured: false }]);
    markDirty();
  }
  function removePricingPackage(index: number) {
    setPricingPackages((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }
  function updatePricingPackage(index: number, key: Exclude<keyof PricingPackageForm, 'is_featured'>, value: string) {
    setPricingPackages((prev) => prev.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
    markDirty();
  }
  function updatePricingFeatured(index: number, value: boolean) {
    setPricingPackages((prev) => prev.map((p, i) => (i === index ? { ...p, is_featured: value } : p)));
    markDirty();
  }

  function setFocal(next: FocalPoint) {
    setCoverFocal(clampFocal(next));
    markDirty();
  }
  function nudgeFocalBy(dx: number, dy: number) {
    setCoverFocal((prev) => nudgeFocal(prev, dx, dy));
    markDirty();
  }

  function toggleFeature(key: FeatureKey) {
    const next = !isFeatureEnabled(featureFlags, key);
    setFeatureFlags((prev) => ({ ...prev, [key]: next }));
    setFeatureFlagsDirty(true);
    markDirty();
  }

  function toggleGroup(key: StudioGroupKey) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  function openGroup(key: StudioGroupKey) {
    setOpenGroups((prev) => ({ ...prev, [key]: true }));
    if (typeof document !== 'undefined') {
      window.setTimeout(() => {
        document.getElementById(`studio-group-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    }
  }

  // ── Save (two writes; partial failure stays dirty and names the half; always revalidates) ──

  async function save(overridePublished?: boolean) {
    if (!gymId) {
      toast.error('Missing gym context.');
      return;
    }
    if (isUploadingLogo || isUploadingCover) {
      toast.error('Please wait for image upload to finish before saving.');
      return;
    }
    const publishState = overridePublished ?? isPublished;
    const normalizedColor = brandColor.trim().toUpperCase();
    if (!isValidHex(normalizedColor)) {
      setBrandColorError('Brand color must be a valid #RRGGBB value.');
      return;
    }
    const normalizedSecondary = secondaryColor.trim().toUpperCase();
    if (!isValidHex(normalizedSecondary)) {
      setSecondaryColorError('Secondary color must be a valid #RRGGBB value.');
      return;
    }
    if (publishState && !hasTagline) {
      toast.error('Add a tagline before publishing your gym page.');
      return;
    }
    if (overridePublished !== undefined && overridePublished !== isPublished) {
      setIsPublished(overridePublished);
    }

    setBrandColorError('');
    setSecondaryColorError('');
    setIsSaving(true);
    isSavingRef.current = true;

    const shouldSaveFlags = featureFlagsDirty && canManageFeatures;
    let gymOk = false;
    let flagsOk = true;

    try {
      const socialPayload: Record<string, string> = {};
      if (socialLinks.facebook.trim()) socialPayload.facebook = socialLinks.facebook.trim();
      if (socialLinks.instagram.trim()) socialPayload.instagram = socialLinks.instagram.trim();
      if (socialLinks.website.trim()) socialPayload.website = socialLinks.website.trim();

      // Built as a plain record so the two forward-compatible columns
      // (cover_focal / section_visibility — added by migration 017) do not trip
      // the generated Update type before that migration lands.
      const gymUpdate: Record<string, unknown> = {
          id: gymId,
          name: gymName.trim(),
          code: gymCode.trim(),
          is_published: publishState,
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          brand_color: normalizedColor,
          secondary_color: normalizedSecondary,
          logo_path: logoPath || null,
          cover_path: coverPath || null,
          logo_url: logoUrl ? logoUrl.split('?')[0] : null,
          cover_url: coverUrl ? coverUrl.split('?')[0] : null,
          address: address.trim() || null,
          phone: phone.trim() || null,
          operating_hours: operatingHours,
          amenities: amenities.length > 0 ? amenities : null,
          social_links: Object.keys(socialPayload).length > 0 ? socialPayload : null,
          team_members:
            teamMembers.length > 0
              ? teamMembers
                  .filter((m) => m.name.trim())
                  .map((m) => ({
                    name: m.name.trim(),
                    role: m.role.trim(),
                    bio: m.bio.trim() || undefined,
                    photo_url: m.photo_url.trim() || undefined,
                  }))
              : null,
          pricing_packages:
            pricingPackages.length > 0
              ? pricingPackages
                  .filter((p) => p.name.trim())
                  .map((p) => ({
                    name: p.name.trim(),
                    price: p.price.trim(),
                    duration: p.duration.trim(),
                    features: p.features.split('\n').map((f) => f.trim()).filter(Boolean),
                    is_featured: p.is_featured,
                  }))
              : null,
          map_embed_url: mapEmbedUrl.trim() || null,
          directions: directions.trim() || null,
      };
      // New Studio metadata columns (migration 017). Only sent when a load proved
      // they exist, so a DB that is behind the app still saves the rest of the page.
      if (studioMetaColumnsAvailable) {
        gymUpdate.cover_focal = coverFocal;
        gymUpdate.section_visibility = sectionVisibility;
      }
      const saveOperation = supabase.from('gyms').update(gymUpdate as never).eq('id', gymId);

      const { error } = await withTimeout(saveOperation, SAVE_TIMEOUT_MS, 'Save request timed out. Please try again.');
      gymOk = !error;
      if (error) console.error('Failed to save gym profile:', error.message);

      if (shouldSaveFlags) {
        try {
          await saveFeatureFlags(supabase, gymId, featureFlags);
          flagsOk = true;
        } catch (e) {
          flagsOk = false;
          console.error('Failed to save feature settings:', e);
        }
      }

      // Save always revalidates — one path, impossible to forget.
      void triggerGymPageRevalidation(gymCode.trim());

      if (gymOk && flagsOk) {
        scheduleStaleAssetCleanup(gymId, logoPath || null, coverPath || null);
        setDirty(false);
        setFeatureFlagsDirty(false);
        toast.success('Gym page updated successfully.');
      } else if (!gymOk && !flagsOk) {
        toast.error('Save failed — please try again.');
      } else if (!gymOk) {
        toast.error(
          shouldSaveFlags
            ? "Your feature settings saved, but the page content didn't — try again."
            : 'Failed to save your page content — try again.',
        );
      } else {
        toast.error("Your page content saved, but feature settings didn't — try again.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error.';
      toast.error(`Failed to save gym profile: ${message}`);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }

  // ── Derived: checklist + preview data ────────────────────────────────────────

  const checklist = useMemo(() => {
    return [
      { key: 'cover' as const, label: 'Cover photo', group: 'photos' as StudioGroupKey, done: !!(coverPath || coverUrl) },
      { key: 'logo' as const, label: 'Logo', group: 'photos' as StudioGroupKey, done: !!(logoPath || logoUrl) },
      { key: 'tagline' as const, label: 'Tagline', group: 'essentials' as StudioGroupKey, done: tagline.trim().length > 0 },
      { key: 'contact' as const, label: 'Contact info', group: 'sections' as StudioGroupKey, done: !!(address.trim() || phone.trim()) },
      { key: 'cta' as const, label: 'Join button', group: 'essentials' as StudioGroupKey, done: true },
    ];
  }, [coverPath, coverUrl, logoPath, logoUrl, tagline, address, phone]);

  const previewData = useMemo<GymPreviewData>(() => {
    const anyHours = DAYS.some((d) => operatingHours[d].trim());
    const team = teamMembers
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        role: m.role.trim(),
        bio: m.bio.trim() || undefined,
        photo_url: m.photo_url.trim() || undefined,
      }));
    const pricing = pricingPackages
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        price: p.price.trim(),
        duration: p.duration.trim(),
        features: p.features.split('\n').map((f) => f.trim()).filter(Boolean),
        is_featured: p.is_featured,
      }));
    const social: { facebook?: string; instagram?: string; website?: string } = {};
    if (socialLinks.facebook.trim()) social.facebook = socialLinks.facebook.trim();
    if (socialLinks.instagram.trim()) social.instagram = socialLinks.instagram.trim();
    if (socialLinks.website.trim()) social.website = socialLinks.website.trim();

    return {
      name: gymName,
      code: gymCode,
      tagline: tagline.trim() || null,
      description: description.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      logoUrl: logoUrl || null,
      coverUrl: coverUrl || null,
      brandColor,
      secondaryColor,
      operatingHours: anyHours ? operatingHours : null,
      amenities: amenities.length > 0 ? amenities : null,
      socialLinks: Object.keys(social).length > 0 ? social : null,
      teamMembers: team.length > 0 ? team : null,
      pricingPackages: pricing.length > 0 ? pricing : null,
      mapEmbedUrl: mapEmbedUrl.trim() || null,
      directions: directions.trim() || null,
      memberCount: 0,
      coverFocal,
      sectionVisibility,
    };
  }, [
    gymName, gymCode, tagline, description, address, phone, logoUrl, coverUrl, brandColor, secondaryColor,
    operatingHours, amenities, socialLinks, teamMembers, pricingPackages, mapEmbedUrl, directions,
    coverFocal, sectionVisibility,
  ]);

  return {
    gymId,
    access, canPublish, canManageFeatures,
    isLoading, isSaving, dirty,
    gymName, gymCode, isPublished, hasTagline, togglePublish,
    tagline, setTagline, description, setDescription,
    brandColor, setBrandColor, brandColorError,
    secondaryColor, setSecondaryColor, secondaryColorError,
    logoUrl, coverUrl, logoPath, coverPath,
    isUploadingLogo, isUploadingCover, isDraggingLogo, isDraggingCover, setIsDraggingLogo, setIsDraggingCover,
    logoInputRef, coverInputRef, uploadAsset, resetAsset, handleAssetSelection,
    coverFocal, setFocal, nudgeFocalBy, focalEditing, setFocalEditing,
    amenities, amenityInput, setAmenityInput, addAmenity, removeAmenity,
    operatingHours, setHour,
    address, setAddress, phone, setPhone, socialLinks, setSocial,
    sectionVisibility, toggleSection,
    teamMembers, addTeamMember, removeTeamMember, updateTeamMember,
    pricingPackages, addPricingPackage, removePricingPackage, updatePricingPackage, updatePricingFeatured,
    mapEmbedUrl, setMapEmbedUrl, directions, setDirections,
    featureFlags, toggleFeature,
    previewTab, setPreviewTab, previewDevice, setPreviewDevice, showSafeArea, setShowSafeArea,
    drawerOpen, setDrawerOpen,
    openGroups, toggleGroup, openGroup,
    checklist, previewData,
    save,
    days: DAYS,
  };
}

export type StudioApi = ReturnType<typeof useStudioState>;

const StudioContext = createContext<StudioApi | null>(null);

export function useStudio(): StudioApi {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within GymPageStudio');
  return ctx;
}

function toSectionVisibility(value: unknown): SectionVisibility {
  const fallback = { amenities: true, hours: true, contact: true };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const src = value as Record<string, unknown>;
  return {
    amenities: typeof src.amenities === 'boolean' ? src.amenities : true,
    hours: typeof src.hours === 'boolean' ? src.hours : true,
    contact: typeof src.contact === 'boolean' ? src.contact : true,
  };
}

export function GymPageStudio(props: GymPageStudioProps = {}) {
  const api = useStudioState(props);

  if (api.isLoading) {
    return <PageSkeleton rows={4} height={96} />;
  }

  return (
    <StudioContext.Provider value={api}>
      <StudioLayout />
    </StudioContext.Provider>
  );
}
