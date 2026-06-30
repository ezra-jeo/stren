'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { isValidHex } from '@/lib/brand-color';
import { toast } from 'sonner';
import { ExternalLink, Plus, Upload, X } from 'lucide-react';
import { PageSkeleton } from '@/components/ui/loading-screen';

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
  operating_hours: unknown;
  amenities: string[] | null;
  social_links: unknown;
  team_members: unknown;
  pricing_packages: unknown;
  map_embed_url: string | null;
  directions: string | null;
};

function emptyHours(): HoursState {
  return {
    Monday: '',
    Tuesday: '',
    Wednesday: '',
    Thursday: '',
    Friday: '',
    Saturday: '',
    Sunday: '',
  };
}

// Compute a short hex hash of a Blob so each unique image gets a unique filename.
//
// Why this solves the replace problem:
//   - Upload image A  → path becomes "{gymId}/logo-{hashA}.jpg"  → new URL → browser fetches it ✓
//   - Replace with B  → path becomes "{gymId}/logo-{hashB}.jpg"  → different URL → browser fetches it ✓
//   - Revert to A     → path becomes "{gymId}/logo-{hashA}.jpg"  → already in bucket → upsert no-ops ✓
//   - Re-upload same  → same hash → same path → upsert is safe, URL unchanged → no flicker ✓
//
// Old fixed-path approach ("{gymId}/logo.jpg") always produced the same URL after replace,
// so React never re-rendered the <img> and the browser kept serving the cached version.
async function blobHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // First 8 bytes → 16 hex chars. Collision-proof for a single gym's media files.
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

export default function GymProfilePage() {
  const { profile, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const fileSignatureCacheRef = useRef(new Map<string, { path: string; url: string }>());
  const hashAssetCacheRef = useRef(new Map<string, { path: string; url: string }>());

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const [gymName, setGymName] = useState('');
  const [gymCode, setGymCode] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [brandColor, setBrandColor] = useState('#D4956A');
  const [brandColorError, setBrandColorError] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('#2C2C2C');
  const [secondaryColorError, setSecondaryColorError] = useState('');

  const [logoPath, setLogoPath] = useState('');
  const [coverPath, setCoverPath] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [operatingHours, setOperatingHours] = useState<HoursState>(emptyHours());

  const [amenities, setAmenities] = useState<string[]>([]);
  const [amenityInput, setAmenityInput] = useState('');

  const [socialLinks, setSocialLinks] = useState<SocialState>({
    facebook: '',
    instagram: '',
    website: '',
  });

  const [teamMembers, setTeamMembers] = useState<TeamMemberForm[]>([]);
  const [pricingPackages, setPricingPackages] = useState<PricingPackageForm[]>([]);
  const [mapEmbedUrl, setMapEmbedUrl] = useState('');
  const [directions, setDirections] = useState('');

  const hasTagline = tagline.trim().length > 0;

  const cleanupTimerRef = useRef<number | null>(null);
  const cleanupInProgressRef = useRef(false);
  const isSavingRef = useRef(false);
  const isUploadingLogoRef = useRef(false);
  const isUploadingCoverRef = useRef(false);

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) {
        window.clearTimeout(cleanupTimerRef.current);
      }
    };
  }, []);

  function buildAssetSignature(file: File, kind: 'logo' | 'cover') {
    return `${kind}:${file.name}:${file.size}:${file.type}:${file.lastModified}`;
  }

  function extractHashFromPath(path: string, kind: 'logo' | 'cover') {
    const fileName = path.split('/').pop() ?? '';
    const prefix = `${kind}-`;
    if (!fileName.startsWith(prefix) || !fileName.endsWith('.jpg')) return null;
    return fileName.slice(prefix.length, -4);
  }

  function getPublicAssetUrl(path: string) {
    const { data } = supabase.storage.from('gym-assets').getPublicUrl(path);
    return data.publicUrl;
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
  }

  function rememberAsset(kind: 'logo' | 'cover', path: string, url: string, signature?: string) {
    if (signature) {
      fileSignatureCacheRef.current.set(signature, { path, url });
    }

    const hash = extractHashFromPath(path, kind);
    if (hash) {
      hashAssetCacheRef.current.set(`${kind}:${hash}`, { path, url });
    }
  }

  useEffect(() => {
    if (authLoading) return;

    if (!profile) {
      setIsLoading(false);
      router.replace('/login');
      return;
    }

    if (profile.role !== 'owner') {
      setIsLoading(false);
      router.replace('/admin');
      return;
    }

    if (!profile.gymId) {
      setIsLoading(false);
      return;
    }

    loadGym(profile.gymId);
  }, [authLoading, profile, router]);

  async function loadGym(gymId: string) {
    setIsLoading(true);
    try {
      const primary = await retryOnBenignLock(() =>
        withTimeout(
          supabase
            .from('gyms')
            .select('id, name, code, is_published, tagline, description, brand_color, secondary_color, logo_url, cover_url, logo_path, cover_path, operating_hours, amenities, social_links, team_members, pricing_packages, map_embed_url, directions')
            .eq('id', gymId)
            .maybeSingle(),
          GYM_PROFILE_LOAD_TIMEOUT_MS,
          'Gym profile load timed out.',
        )
      );

      let data = primary.data as GymProfileRow | null;

      if (primary.error) {
        const fallback = await retryOnBenignLock(() =>
          withTimeout(
            supabase
              .from('gyms')
              .select('id, name, code, tagline, description, brand_color, logo_url, cover_url, logo_path, cover_path, operating_hours, amenities, social_links, team_members, pricing_packages, map_embed_url, directions')
              .eq('id', gymId)
              .maybeSingle(),
            GYM_PROFILE_LOAD_TIMEOUT_MS,
            'Gym profile fallback load timed out.',
          )
        );

        if (fallback.error || !fallback.data) {
          toast.error('Unable to load gym profile.');
          return;
        }

        data = fallback.data as GymProfileRow;
      }

      if (!data) {
        toast.error('Unable to load gym profile.');
        return;
      }

    setGymName(data.name ?? '');
    setGymCode(data.code ?? '');
    setIsPublished(!!data.is_published);
    setTagline(data.tagline ?? '');
    setDescription(data.description ?? '');
    setBrandColor(data.brand_color && isValidHex(data.brand_color) ? data.brand_color : '#D4956A');
    setSecondaryColor(data.secondary_color && isValidHex(data.secondary_color) ? data.secondary_color : '#2C2C2C');
    setLogoPath(data.logo_path ?? '');
    setCoverPath(data.cover_path ?? '');

    const normalizedLogoPath = data.logo_path ?? '';
    const normalizedCoverPath = data.cover_path ?? '';

    if (normalizedLogoPath) {
      const { data: logoPublic } = supabase.storage.from('gym-assets').getPublicUrl(normalizedLogoPath);
      setLogoUrl(logoPublic.publicUrl);
      rememberAsset('logo', normalizedLogoPath, logoPublic.publicUrl);
    } else {
      setLogoUrl(data.logo_url ?? '');
    }

    if (normalizedCoverPath) {
      const { data: coverPublic } = supabase.storage.from('gym-assets').getPublicUrl(normalizedCoverPath);
      setCoverUrl(coverPublic.publicUrl);
      rememberAsset('cover', normalizedCoverPath, coverPublic.publicUrl);
    } else {
      setCoverUrl(data.cover_url ?? '');
    }

    setAmenities(data.amenities ?? []);

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
      setTeamMembers(data.team_members.map((m: any) => ({
        name: m.name ?? '', role: m.role ?? '', bio: m.bio ?? '', photo_url: m.photo_url ?? '',
      })));
    }

    if (Array.isArray(data.pricing_packages)) {
      setPricingPackages(data.pricing_packages.map((p: any) => ({
        name: p.name ?? '',
        price: p.price ?? '',
        duration: p.duration ?? '',
        features: Array.isArray(p.features) ? p.features.join('\n') : '',
        is_featured: p.is_featured ?? false,
      })));
    }

      setMapEmbedUrl(data.map_embed_url ?? '');
      setDirections(data.directions ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown load error.';
      toast.error(`Unable to load gym profile: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function compressImage(
    file: File,
    kind: 'logo' | 'cover'
  ): Promise<{ blob: Blob }> {
    const maxWidth  = kind === 'logo' ? 400  : 1920;
    const maxHeight = kind === 'logo' ? 400  : 1080;
    const quality   = kind === 'logo' ? 0.90 : 0.82;

    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width  = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Compression failed')); return; }
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
    if (!profile?.gymId) return;

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
      const newPath = `${profile.gymId}/${fileName}`;
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
          const compressed = await withTimeout(
            compressImage(file, kind),
            COMPRESS_TIMEOUT_MS,
            'Image compression timed out.',
          );
          uploadBlob = compressed.blob;
        } catch {
          // Compression failed — upload original.
        }
      }

      const { error } = await withTimeout(
        supabase.storage
          .from('gym-assets')
          .upload(newPath, uploadBlob, { upsert: true, contentType: 'image/jpeg' }),
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
      return;
    }
    setCoverPath('');
    setCoverUrl('');
  }

  function handleAssetSelection(file: File | undefined, kind: 'logo' | 'cover') {
    if (!file) return;
    void uploadAsset(file, kind);
  }

  function handleAssetDrop(event: React.DragEvent<HTMLButtonElement>, kind: 'logo' | 'cover') {
    event.preventDefault();

    if (kind === 'logo') setIsDraggingLogo(false);
    if (kind === 'cover') setIsDraggingCover(false);

    const file = event.dataTransfer.files?.[0];
    handleAssetSelection(file, kind);
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
  }

  function removeAmenity(value: string) {
    setAmenities((prev) => prev.filter((item) => item !== value));
  }

  function addTeamMember() {
    setTeamMembers((prev) => [...prev, { name: '', role: '', bio: '', photo_url: '' }]);
  }

  function removeTeamMember(index: number) {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTeamMember(index: number, key: keyof TeamMemberForm, value: string) {
    setTeamMembers((prev) => prev.map((member, i) => {
      if (i !== index) return member;
      return { ...member, [key]: value };
    }));
  }

  function addPricingPackage() {
    setPricingPackages((prev) => [...prev, { name: '', price: '', duration: '', features: '', is_featured: false }]);
  }

  function removePricingPackage(index: number) {
    setPricingPackages((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePricingPackage(index: number, key: Exclude<keyof PricingPackageForm, 'is_featured'>, value: string) {
    setPricingPackages((prev) => prev.map((pkg, i) => {
      if (i !== index) return pkg;
      return { ...pkg, [key]: value };
    }));
  }

  function updatePricingFeatured(index: number, value: boolean) {
    setPricingPackages((prev) => prev.map((pkg, i) => {
      if (i !== index) return pkg;
      return { ...pkg, is_featured: value };
    }));
  }

  async function cleanupStaleGymAssets(gymId: string, currentLogoPath: string | null, currentCoverPath: string | null) {
    try {
      const { data: listed, error } = await withTimeout(
        supabase.storage
          .from('gym-assets')
          .list(gymId, { limit: 200, sortBy: { column: 'updated_at', order: 'desc' } }),
        CLEANUP_LIST_TIMEOUT_MS,
        'Cleanup list timed out.',
      );

      if (error || !listed || listed.length === 0) return;

      const grouped: Record<'logo' | 'cover', string[]> = { logo: [], cover: [] };
      for (const entry of listed) {
        const kind = getAssetKindFromName(entry.name);
        if (!kind) continue;
        grouped[kind].push(`${gymId}/${entry.name}`);
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

      for (const removedPath of toRemove) {
        removeCachedAssetPath(removedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'Cleanup list timed out.' || message === 'Cleanup remove timed out.') {
        return;
      }
      console.error('Failed to clean old gym assets:', error);
    }
  }

  function scheduleStaleAssetCleanup(gymId: string, currentLogoPath: string | null, currentCoverPath: string | null) {
    if (cleanupTimerRef.current) {
      window.clearTimeout(cleanupTimerRef.current);
    }

    cleanupTimerRef.current = window.setTimeout(() => {
      if (cleanupInProgressRef.current) return;

      if (isSavingRef.current || isUploadingLogoRef.current || isUploadingCoverRef.current) {
        scheduleStaleAssetCleanup(gymId, currentLogoPath, currentCoverPath);
        return;
      }

      cleanupInProgressRef.current = true;
      void (async () => {
        try {
          await cleanupStaleGymAssets(gymId, currentLogoPath, currentCoverPath);
        } finally {
          cleanupInProgressRef.current = false;
          cleanupTimerRef.current = null;
        }
      })();
    }, CLEANUP_DELAY_MS);
  }

  async function handleSave() {
    if (!profile?.gymId) {
      toast.error('Missing gym context.');
      return;
    }

    if (isUploadingLogo || isUploadingCover) {
      toast.error('Please wait for image upload to finish before saving.');
      return;
    }

    if (!gymName.trim() || !gymCode.trim()) {
      toast.error('Gym name and code are required.');
      return;
    }

    if (isPublished && !hasTagline) {
      toast.error('Add a tagline before publishing your gym page.');
      return;
    }

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

    setBrandColorError('');
    setSecondaryColorError('');
    setIsSaving(true);
    isSavingRef.current = true;

    try {
      const socialPayload: Record<string, string> = {};
      if (socialLinks.facebook.trim()) socialPayload.facebook = socialLinks.facebook.trim();
      if (socialLinks.instagram.trim()) socialPayload.instagram = socialLinks.instagram.trim();
      if (socialLinks.website.trim()) socialPayload.website = socialLinks.website.trim();

      const saveOperation = supabase.from('gyms').update({
        id: profile.gymId,
        name: gymName.trim(),
        code: gymCode.trim(),
        is_published: isPublished,
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        brand_color: normalizedColor,
        secondary_color: normalizedSecondary,
        logo_path: logoPath || null,
        cover_path: coverPath || null,
        // Strip any accidental query params before persisting
        logo_url: logoUrl ? logoUrl.split('?')[0] : null,
        cover_url: coverUrl ? coverUrl.split('?')[0] : null,
        operating_hours: operatingHours,
        amenities: amenities.length > 0 ? amenities : null,
        social_links: Object.keys(socialPayload).length > 0 ? socialPayload : null,
        team_members: teamMembers.length > 0
          ? teamMembers
            .filter((m) => m.name.trim())
            .map((m) => ({
              name: m.name.trim(),
              role: m.role.trim(),
              bio: m.bio.trim() || undefined,
              photo_url: m.photo_url.trim() || undefined,
            }))
          : null,
        pricing_packages: pricingPackages.length > 0
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
      }).eq('id', profile.gymId);

      const { error } = await withTimeout(
        saveOperation,
        SAVE_TIMEOUT_MS,
        'Save request timed out. Please try again.',
      );

      if (error) {
        toast.error(`Failed to save gym profile: ${error.message}`);
        return;
      }

      void triggerGymPageRevalidation(gymCode.trim());
      scheduleStaleAssetCleanup(profile.gymId, logoPath || null, coverPath || null);
      toast.success('Gym profile updated successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown save error.';
      toast.error(`Failed to save gym profile: ${message}`);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
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

  if (authLoading || isLoading) {
    return <PageSkeleton rows={4} height={96} />;
  }

  if (!profile || profile.role !== 'owner') {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
        >
          Gym Page
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Customize your public gym landing page
        </p>
      </div>

      <div
        className="rounded-xl border px-4 py-3"
        style={{
          backgroundColor: isPublished ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
          borderColor: isPublished ? 'var(--color-success)' : 'var(--color-warning)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {isPublished ? 'Your page is live.' : 'Your page is currently hidden from the public.'}
          </p>
          <Link
            href={`/gym/${gymCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm inline-flex items-center gap-1"
            style={{ color: isPublished ? 'var(--color-success)' : 'var(--color-warning)' }}
          >
            {isPublished ? 'Preview as visitor' : 'Preview as admin'} <ExternalLink size={14} />
          </Link>
        </div>
      </div>

      <section
        className="rounded-xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Basic Info</h2>

        <div
          className="rounded-lg border px-3 py-2.5"
          style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-background)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Public visibility
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Toggle whether your gym page is publicly visible. A tagline is required before your page can be published.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!isPublished && !hasTagline) {
                  toast.error('Add a tagline before publishing your gym page.');
                  return;
                }
                setIsPublished((prev) => !prev);
              }}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                backgroundColor: isPublished ? 'var(--color-success)' : 'var(--color-surface)',
                color: isPublished ? 'var(--color-white)' : 'var(--color-text-secondary)',
              }}
            >
              {isPublished ? 'Published' : 'Hidden'}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Tagline</label>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{tagline.length}/120</span>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Tagline is required to publish your gym page.
          </p>
          <input
            value={tagline}
            maxLength={120}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Your gym's one-liner"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
          />
        </div>

        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell people what makes your gym special"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
          />
        </div>

        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Brand Color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={isValidHex(brandColor) ? brandColor : '#D4956A'}
              onChange={(e) => {
                setBrandColor(e.target.value.toUpperCase());
                setBrandColorError('');
              }}
              className="h-10 w-12 rounded border"
              style={{ borderColor: 'var(--color-surface)' }}
            />
            <input
              value={brandColor}
              onChange={(e) => {
                setBrandColor(e.target.value.toUpperCase());
                setBrandColorError('');
              }}
              placeholder="#D4956A"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
            />
            <div
              className="h-10 w-10 rounded-lg border"
              style={{ borderColor: 'var(--color-surface)', backgroundColor: isValidHex(brandColor) ? brandColor : '#D4956A' }}
            />
          </div>
          {brandColorError && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{brandColorError}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Secondary Color</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={isValidHex(secondaryColor) ? secondaryColor : '#2C2C2C'}
              onChange={(e) => {
                setSecondaryColor(e.target.value.toUpperCase());
                setSecondaryColorError('');
              }}
              className="h-10 w-12 rounded border"
              style={{ borderColor: 'var(--color-surface)' }}
            />
            <input
              value={secondaryColor}
              onChange={(e) => {
                setSecondaryColor(e.target.value.toUpperCase());
                setSecondaryColorError('');
              }}
              placeholder="#2C2C2C"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
            />
            <div
              className="h-10 w-10 rounded-lg border"
              style={{ borderColor: 'var(--color-surface)', backgroundColor: isValidHex(secondaryColor) ? secondaryColor : '#2C2C2C' }}
            />
          </div>
          {secondaryColorError && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{secondaryColorError}</p>
          )}
        </div>
      </section>

      <section
        className="rounded-xl border p-5 space-y-4"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Images</h2>

        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Click a card or drag and drop an image to upload. Changes are saved when you click Save Changes.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Logo */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--color-surface)' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Logo</h3>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Best results: square PNG or JPG</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
                  style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                >
                  <Upload size={12} /> {logoUrl ? 'Replace' : 'Upload'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => resetAsset('logo')}
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleAssetSelection(e.target.files?.[0], 'logo');
                e.currentTarget.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (!isUploadingLogo) setIsDraggingLogo(true); }}
              onDragLeave={() => setIsDraggingLogo(false)}
              onDrop={(e) => handleAssetDrop(e, 'logo')}
              disabled={isUploadingLogo}
              className="w-full rounded-xl border border-dashed p-4 transition disabled:opacity-60"
              style={{
                borderColor: isDraggingLogo ? 'var(--color-primary)' : 'var(--color-surface)',
                backgroundColor: isDraggingLogo ? 'var(--color-primary-glow)' : 'var(--color-background)',
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Gym logo"
                  className="mx-auto h-24 w-24 rounded-full object-cover border"
                  style={{ borderColor: 'var(--color-surface)' }}
                />
              ) : (
                <div className="py-4 text-center">
                  <Upload className="mx-auto" size={18} style={{ color: 'var(--color-primary)' }} />
                  <p className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Upload logo photo</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tap or drop file here</p>
                </div>
              )}
            </button>

            {isUploadingLogo && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Uploading logo...</p>}
          </div>

          {/* Cover */}
          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--color-surface)' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Cover Image</h3>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Best results: wide image (16:9)</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={isUploadingCover}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60"
                  style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                >
                  <Upload size={12} /> {coverUrl ? 'Replace' : 'Upload'}
                </button>
                {coverUrl && (
                  <button
                    type="button"
                    onClick={() => resetAsset('cover')}
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-danger)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handleAssetSelection(e.target.files?.[0], 'cover');
                e.currentTarget.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (!isUploadingCover) setIsDraggingCover(true); }}
              onDragLeave={() => setIsDraggingCover(false)}
              onDrop={(e) => handleAssetDrop(e, 'cover')}
              disabled={isUploadingCover}
              className="w-full rounded-xl border border-dashed p-3 transition disabled:opacity-60"
              style={{
                borderColor: isDraggingCover ? 'var(--color-primary)' : 'var(--color-surface)',
                backgroundColor: isDraggingCover ? 'var(--color-primary-glow)' : 'var(--color-background)',
              }}
            >
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt="Gym cover"
                  className="h-40 w-full rounded-lg object-cover border"
                  style={{ borderColor: 'var(--color-surface)' }}
                />
              ) : (
                <div className="py-8 text-center">
                  <Upload className="mx-auto" size={18} style={{ color: 'var(--color-primary)' }} />
                  <p className="mt-2 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>Upload cover photo</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Tap or drop file here</p>
                </div>
              )}
            </button>

            {isUploadingCover && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Uploading cover image...</p>}
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Operating Hours</h2>
        <div className="space-y-3">
          {DAYS.map((day) => (
            <div key={day} className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-2 md:gap-3 items-center">
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{day}</span>
              <input
                value={operatingHours[day]}
                onChange={(e) => setOperatingHours((prev) => ({ ...prev, [day]: e.target.value }))}
                placeholder="5:00 AM – 10:00 PM"
                className="rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
              />
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Amenities</h2>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={amenityInput}
            onChange={(e) => setAmenityInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAmenity(); } }}
            placeholder="Add amenity"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
          />
          <button
            type="button"
            onClick={addAmenity}
            className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {amenities.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {amenities.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
              >
                {item}
                <button type="button" onClick={() => removeAmenity(item)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Social Links</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Facebook URL</label>
            <input
              value={socialLinks.facebook}
              onChange={(e) => setSocialLinks((prev) => ({ ...prev, facebook: e.target.value }))}
              placeholder="https://facebook.com/your-gym"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
            />
          </div>
          <div>
            <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Instagram URL</label>
            <input
              value={socialLinks.instagram}
              onChange={(e) => setSocialLinks((prev) => ({ ...prev, instagram: e.target.value }))}
              placeholder="https://instagram.com/your-gym"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
            />
          </div>
          <div>
            <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Website URL</label>
            <input
              value={socialLinks.website}
              onChange={(e) => setSocialLinks((prev) => ({ ...prev, website: e.target.value }))}
              placeholder="https://yourgym.com"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
            />
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Team Members</h2>
          <button
            type="button"
            onClick={addTeamMember}
            className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
          >
            <Plus size={14} /> Add Member
          </button>
        </div>

        {teamMembers.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No team members added yet.</p>
        ) : (
          <div className="space-y-4">
            {teamMembers.map((member, index) => (
              <div key={`team-${index}`} className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--color-surface)' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
                    <input value={member.name} onChange={(e) => updateTeamMember(index, 'name', e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                  </div>
                  <div>
                    <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Role</label>
                    <input value={member.role} onChange={(e) => updateTeamMember(index, 'role', e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                  </div>
                </div>
                <div>
                  <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Bio</label>
                  <textarea rows={3} value={member.bio} onChange={(e) => updateTeamMember(index, 'bio', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
                    style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                </div>
                <div>
                  <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Photo URL</label>
                  <input value={member.photo_url} onChange={(e) => updateTeamMember(index, 'photo_url', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => removeTeamMember(index)} className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>Pricing Packages</h2>
          <button
            type="button"
            onClick={addPricingPackage}
            className="inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
          >
            <Plus size={14} /> Add Package
          </button>
        </div>

        {pricingPackages.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No packages added yet.</p>
        ) : (
          <div className="space-y-4">
            {pricingPackages.map((pkg, index) => (
              <div key={`pricing-${index}`} className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--color-surface)' }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Name</label>
                    <input value={pkg.name} onChange={(e) => updatePricingPackage(index, 'name', e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                  </div>
                  <div>
                    <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Price</label>
                    <input value={pkg.price} onChange={(e) => updatePricingPackage(index, 'price', e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                  </div>
                  <div>
                    <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Duration</label>
                    <input value={pkg.duration} onChange={(e) => updatePricingPackage(index, 'duration', e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                  </div>
                </div>
                <div>
                  <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Features (one per line)</label>
                  <textarea rows={4} value={pkg.features} onChange={(e) => updatePricingPackage(index, 'features', e.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
                    style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }} />
                </div>
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    <input type="checkbox" checked={pkg.is_featured} onChange={(e) => updatePricingFeatured(index, e.target.checked)} />
                    Featured package
                  </label>
                  <button type="button" onClick={() => removePricingPackage(index)} className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Map</h2>
        <label className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Google Maps Embed URL</label>
        <input
          value={mapEmbedUrl}
          onChange={(e) => setMapEmbedUrl(e.target.value)}
          placeholder="https://www.google.com/maps/embed?..."
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
        />
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Get this from Google Maps &rarr; Share &rarr; Embed a map &rarr; copy the src URL.
        </p>
      </section>

      <section
        className="rounded-xl border p-5"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>Directions</h2>
        <textarea
          rows={5}
          value={directions}
          onChange={(e) => setDirections(e.target.value)}
          placeholder="Add landmarks and commute directions"
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
          style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)', backgroundColor: 'var(--color-white)' }}
        />
      </section>

      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isUploadingLogo || isUploadingCover}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
        >
          {isSaving ? 'Saving...' : (isUploadingLogo || isUploadingCover ? 'Uploading images...' : 'Save Changes')}
        </button>
      </div>
    </div>
  );
}

function isBenignLockAbortError(error: unknown): boolean {
  if (!error) return false;

  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';

  const normalized = message.toLowerCase();
  return normalized.includes('lock broken by another request') && normalized.includes('steal');
}

async function retryOnBenignLock<T>(operation: () => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isBenignLockAbortError(error) || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }

  throw lastError ?? new Error('Unknown lock error.');
}