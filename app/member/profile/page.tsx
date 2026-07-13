'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import { Camera, Edit2, Lock, LogOut, RotateCcw, Save, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { PageSkeleton } from '@/components/ui/loading-screen';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileEditSchema } from '@/lib/validations';
import { GhostBtn, PrimaryBtn } from '@/lib/admin-ui';
import type { AccountProfile as Profile } from '@/lib/types';
import type { z } from 'zod';

type ProfileEditFormData = z.infer<typeof profileEditSchema>;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function toDisplayAvatarUrl(avatarUrl: string | null, updatedAt: string | null): string {
  if (!avatarUrl) return '';
  if (!updatedAt) return avatarUrl;
  const bust = `t=${encodeURIComponent(String(new Date(updatedAt).getTime()))}`;
  return avatarUrl.includes('?') ? `${avatarUrl}&${bust}` : `${avatarUrl}?${bust}`;
}

function formatLockDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isFutureDate(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() > Date.now();
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => response.blob());
}

function buildAvatarAttemptPath(userId: string): string {
  const random = Math.random().toString(36).slice(2);
  return `avatars/${userId}/${Date.now()}-${random}.jpg`;
}

function AvatarSection({ profile, refreshProfile }: { profile: Profile; refreshProfile: () => Promise<void> }) {
  const supabase = useMemo(() => createClient(), []);
  const [avatarUrl, setAvatarUrl] = useState(() => toDisplayAvatarUrl(profile.avatarUrl, profile.avatarUpdatedAt));
  const [lockedUntil, setLockedUntil] = useState<string | null>(profile.avatarChangeLockedUntil);
  const [draftDataUrl, setDraftDataUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSaving, setCameraSaving] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setAvatarUrl(toDisplayAvatarUrl(profile.avatarUrl, profile.avatarUpdatedAt));
    setLockedUntil(profile.avatarChangeLockedUntil);
  }, [profile.avatarChangeLockedUntil, profile.avatarUpdatedAt, profile.avatarUrl]);

  useEffect(() => {
    if (isFutureDate(lockedUntil)) {
      setStatusNote(`Avatar change is locked until ${formatLockDate(lockedUntil)}.`);
    }
  }, [lockedUntil]);

  useEffect(() => {
    return () => {
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function stopCamera() {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    if (isFutureDate(lockedUntil)) {
      setStatusNote(`Avatar change is locked until ${formatLockDate(lockedUntil)}.`);
      return;
    }
    setStatusNote('');
    setCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setDraftDataUrl('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to access camera';
      setCameraError(message);
      toast.error(message);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);
    setDraftDataUrl(canvas.toDataURL('image/jpeg', 0.92));
    await stopCamera();
  }

  async function handleFileSelect(file: File | null) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('Photo must be 5MB or smaller');
      return;
    }

    await stopCamera();
    const reader = new FileReader();
    reader.onload = () => {
      setDraftDataUrl(String(reader.result ?? ''));
    };
    reader.readAsDataURL(file);
  }

  async function saveAvatar() {
    if (!draftDataUrl) return;

    setCameraSaving(true);
    setCameraError('');
    setStatusNote('');
    try {
      const response = await fetch('/api/member/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ avatarDataUrl: draftDataUrl }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        updated?: boolean
        nextAllowedAt?: string | null
        message?: string
        error?: string
        avatarUrl?: string
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to update avatar');
      }

      if (!payload.updated) {
        if (payload.nextAllowedAt) {
          setLockedUntil(payload.nextAllowedAt);
        }
        setStatusNote(payload.message ?? 'Avatar change is on cooldown.');
        toast.warning(payload.message ?? 'Avatar change is on cooldown.');
        return;
      }

      const publicUrl = payload.avatarUrl ?? profile.avatarUrl ?? '';
      setAvatarUrl(toDisplayAvatarUrl(publicUrl, new Date().toISOString()));
      setLockedUntil(payload.nextAllowedAt ?? null);
      setDraftDataUrl('');
      fileInputRef.current && (fileInputRef.current.value = '');
      setStatusNote(payload.message ?? 'Avatar updated successfully.');
      toast.success(payload.message ?? 'Avatar updated successfully.');
      void refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update avatar';
      setCameraError(message);
      setStatusNote(message);
      toast.error(message);
    } finally {
      setCameraSaving(false);
    }
  }

  const locked = isFutureDate(lockedUntil);
  const displayUrl = draftDataUrl || avatarUrl;

  return (
    <div className="rounded-xl p-5 border" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
      <div className="flex flex-col items-center text-center gap-3">
        <div className="relative">
          <div
            className="h-22 w-22 rounded-full overflow-hidden flex items-center justify-center text-xl font-bold"
            style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
          >
            {displayUrl ? (
              <img src={displayUrl} alt={profile.name} className="h-full w-full object-cover" />
            ) : (
              getInitials(profile.name)
            )}
          </div>
          {locked && (
            <div className="absolute -bottom-1 -right-1 rounded-full p-1.5" style={{ backgroundColor: 'var(--color-danger)', color: 'white' }}>
              <Lock size={12} />
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{profile.name}</p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{profile.email}</p>
        </div>

        {locked ? (
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Photo can be changed on {formatLockDate(lockedUntil)}
          </p>
        ) : draftDataUrl ? (
          <div className="w-full space-y-3">
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-surface)' }}>
              <img src={draftDataUrl} alt="New avatar preview" className="h-56 w-full object-cover" />
            </div>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              After saving, you won&apos;t be able to change this for 14 days.
            </p>
            <div className="flex items-center justify-center gap-2">
              <GhostBtn onClick={() => { setDraftDataUrl(''); void startCamera(); }}>
                Retake
              </GhostBtn>
              <PrimaryBtn onClick={() => void saveAvatar()} disabled={cameraSaving}>
                {cameraSaving ? 'Saving...' : 'Save photo'}
              </PrimaryBtn>
            </div>
          </div>
        ) : cameraActive ? (
          <div className="w-full space-y-3">
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-surface)' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-56 w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
            <div className="flex items-center justify-center gap-2">
              <GhostBtn onClick={() => void stopCamera()}>
                Cancel
              </GhostBtn>
              <PrimaryBtn onClick={() => void capturePhoto()}>
                Capture
              </PrimaryBtn>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <PrimaryBtn onClick={() => void startCamera()}>
              <Camera className="h-4 w-4" />
              Camera
            </PrimaryBtn>
            <GhostBtn onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </GhostBtn>
          </div>
        )}

        {cameraError && !locked && (
          <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{cameraError}</p>
        )}

        {statusNote && (
          <p className="text-xs" style={{ color: locked ? 'var(--color-text-muted)' : 'var(--color-text-secondary)' }}>
            {statusNote}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFileSelect(e.target.files?.[0] ?? null)}
        />

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { profile, signOut, isSigningOut, refreshProfile, myGyms, activeGymId } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [membershipInfo, setMembershipInfo] = useState<{
    planName: string;
    startDate: string;
    endDate: string;
    status: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProfileEditFormData>({
    resolver: zodResolver(profileEditSchema),
    defaultValues: {
      name: '',
      contact_number: '',
    },
  });

  useEffect(() => {
    if (!profile) {
      return;
    }

    void generateQR();
    void loadMembership();
    reset({
      name: profile.name,
      contact_number: profile.contactNumber ?? '',
    });
  }, [profile, reset, router]);

  async function generateQR() {
    if (!qrCanvasRef.current || !profile) return;
    try {
      await QRCode.toCanvas(qrCanvasRef.current, profile.qrCode, {
        width: 250,
        margin: 2,
        color: {
          dark: '#2C2C2C',
          light: '#FFFFFF',
        },
      });
    } catch {
      // QR generation failed silently
    }
  }

  async function loadMembership() {
    if (!profile) return;

    const { data } = await supabase
      .from('memberships')
      .select('*, membership_plans(name)')
      .eq('member_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      const plan = data.membership_plans as unknown as { name: string } | null;
      setMembershipInfo({
        planName: plan?.name ?? 'Unknown',
        startDate: data.start_date,
        endDate: data.end_date,
        status: data.status ?? 'expired',
      });
    }
  }

  const onSave = async (data: ProfileEditFormData) => {
    if (!profile) return;

    const { error } = await supabase
      .from('profiles')
      .update({ name: data.name, contact_number: data.contact_number || null })
      .eq('id', profile.id);

    if (error) {
      toast.error('Failed to update profile');
      return;
    }

    toast.success('Profile updated!');
    setIsEditing(false);
    router.refresh();
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    await signOut();
  };

  const daysLeft = membershipInfo && membershipInfo.status === 'active'
    ? Math.max(0, Math.ceil((new Date(membershipInfo.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  if (!profile) return <PageSkeleton rows={3} height={96} />;
  const currentGym = myGyms.find((gym) => gym.gymId === activeGymId) ?? null;

  return (
    <div className="member-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="member-page-title">Profile</h1>
          <p className="mt-2 text-sm text-(--color-text-secondary)">Manage your account and gym identity.</p>
          <p className="mt-1 text-xs font-medium text-(--color-text-muted)">{currentGym ? `Current gym: ${currentGym.name}` : 'No active gym'}</p>
        </div>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all"
          style={{ color: 'var(--color-danger)' }}
        >
          <LogOut size={16} />
          {isSigningOut ? 'Signing Out...' : 'Sign Out'}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <AvatarSection profile={profile} refreshProfile={refreshProfile} />

      <div
        id="member-qr"
        className="rounded-xl p-6 border text-center"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2
          className="text-sm font-semibold uppercase tracking-widest mb-4"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Your QR Code
        </h2>
        <div className="flex justify-center mb-3">
          <canvas ref={qrCanvasRef} className="rounded-lg" />
        </div>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Show this at the gym kiosk to check in
        </p>
      </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
      <div
        className="rounded-xl p-5 border"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-sm font-semibold uppercase tracking-widest"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Personal Info
          </h2>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 text-sm"
              style={{ color: 'var(--color-primary)' }}
            >
              <Edit2 size={14} />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSubmit(onSave)}
                disabled={isSubmitting}
                className="flex items-center gap-1 text-sm font-medium"
                style={{ color: 'var(--color-success)' }}
              >
                <Save size={14} />
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-1 text-sm"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          <div>
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Name</label>
            {isEditing ? (
              <>
                <input
                  {...register('name')}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--color-light-gray)', color: 'var(--color-text-primary)' }}
                />
                {errors.name && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.name.message}</p>}
              </>
            ) : (
              <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{profile.name}</p>
            )}
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Email</label>
            <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{profile.email}</p>
          </div>
          <div>
            <label className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Contact Number</label>
            {isEditing ? (
              <>
                <input
                  {...register('contact_number')}
                  placeholder="09XX XXX XXXX"
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--color-light-gray)', color: 'var(--color-text-primary)' }}
                />
                {errors.contact_number && <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>{errors.contact_number.message}</p>}
              </>
            ) : (
              <p className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {profile.contactNumber || 'Not set'}
              </p>
            )}
          </div>
        </form>
      </div>

      <div
        className="rounded-xl p-5 border"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <h2
          className="text-sm font-semibold uppercase tracking-widest mb-4"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Membership
        </h2>
        {membershipInfo ? (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Plan</span>
              <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>{membershipInfo.planName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Status</span>
              <div className="flex items-center gap-2">
                <span
                  className="font-medium text-sm px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: membershipInfo.status === 'active' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                    color: membershipInfo.status === 'active' ? 'var(--color-success)' : 'var(--color-danger)',
                  }}
                >
                  {membershipInfo.status}
                </span>
                {membershipInfo.status === 'active' && daysLeft !== null && daysLeft <= 7 && (
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
                  >
                    Expiring soon
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Expires</span>
              <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {new Date(membershipInfo.endDate).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Remaining</span>
              <span className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
                {membershipInfo.status === 'active' && daysLeft !== null
                  ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                  : 'Expired'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No membership record found.
          </p>
        )}
      </div>
      </div>

      <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Member since {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </p>
    </div>
  );
}
