'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';
import { A, PrimaryBtn, GhostBtn } from '@/lib/admin-ui';
import { useWizard } from '@/lib/onboarding/state';
import { gymStepSchema, type GymStepData } from '@/lib/onboarding/schemas';
import { sanitizeSlugInput, validateSlugFormat } from '@/lib/onboarding/slug';

const MAX_LOGO_BYTES = 3 * 1024 * 1024;

type SlugCheckState = { status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'; message?: string };

export function StepGym({ onContinue, onSaveDraft }: { onContinue: () => void; onSaveDraft: () => void }) {
  const { state, dispatch } = useWizard();
  const { gym } = state.draft;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [slugCheck, setSlugCheck] = useState<SlugCheckState>({ status: 'idle' });

  const {
    register, handleSubmit, watch, setValue, formState: { errors },
  } = useForm<GymStepData>({
    resolver: zodResolver(gymStepSchema),
    defaultValues: { gymName: gym.gymName, branchName: gym.branchName, address: gym.address, slug: gym.slug },
    mode: 'onBlur',
  });

  const watched = watch();

  useEffect(() => {
    dispatch({ type: 'setGym', patch: { gymName: watched.gymName ?? '' } });
  }, [watched.gymName, dispatch]);

  useEffect(() => {
    dispatch({ type: 'setGym', patch: { branchName: watched.branchName ?? '' } });
  }, [watched.branchName, dispatch]);

  useEffect(() => {
    dispatch({ type: 'setGym', patch: { address: watched.address ?? '' } });
  }, [watched.address, dispatch]);

  // Keep the RHF slug field in sync when the reducer auto-derives it from the name.
  useEffect(() => {
    if (gym.slug !== watched.slug) setValue('slug', gym.slug, { shouldValidate: false });
  }, [gym.slug, watched.slug, setValue]);

  // Debounced remote uniqueness check.
  useEffect(() => {
    const slug = watched.slug?.trim().toLowerCase() ?? '';
    if (!slug) { setSlugCheck({ status: 'idle' }); return; }
    const format = validateSlugFormat(slug);
    if (!format.valid) { setSlugCheck({ status: 'invalid', message: format.reason }); return; }

    setSlugCheck({ status: 'checking' });
    const handle = window.setTimeout(() => {
      void fetch(`/api/superadmin/onboarding/slug-check?slug=${encodeURIComponent(slug)}`)
        .then((res) => res.json())
        .then((data: { available?: boolean; reason?: string; error?: string }) => {
          if (data.error) { setSlugCheck({ status: 'error', message: data.error }); return; }
          setSlugCheck(data.available ? { status: 'available' } : { status: 'taken', message: data.reason });
        })
        .catch(() => setSlugCheck({ status: 'error', message: 'Could not check availability right now.' }));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [watched.slug]);

  function handleSlugChange(value: string) {
    const normalized = sanitizeSlugInput(value);
    setValue('slug', normalized, { shouldValidate: true });
    dispatch({ type: 'setGym', patch: { slug: normalized, slugTouched: true } });
  }

  function handleLogoSelect(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return; }
    if (file.size > MAX_LOGO_BYTES) { toast.error('Logo must be 3MB or smaller.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      dispatch({ type: 'setGym', patch: { logoDataUrl: String(reader.result ?? ''), logoFileName: file.name } });
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    dispatch({ type: 'setGym', patch: { logoDataUrl: null, logoFileName: null } });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function onValid() {
    if (slugCheck.status === 'taken' || slugCheck.status === 'invalid') {
      toast.error(slugCheck.message ?? 'Fix the gym URL before continuing.');
      return;
    }
    dispatch({ type: 'markStepComplete', step: 'gym' });
    onContinue();
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="onboarding-step-enter space-y-5" noValidate>
      <div>
        <label htmlFor="gymName" className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Gym name</label>
        <input
          id="gymName"
          {...register('gymName')}
          aria-invalid={!!errors.gymName}
          aria-describedby={errors.gymName ? 'gymName-error' : undefined}
          placeholder="Iron Fitness Gym"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: A.surface2, border: `1px solid ${errors.gymName ? A.danger : A.border}`, color: A.text }}
        />
        {errors.gymName && <p id="gymName-error" className="mt-1 text-xs" style={{ color: A.danger }}>{errors.gymName.message}</p>}
      </div>

      <div>
        <label htmlFor="branchName" className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>
          Branch name <span style={{ color: A.muted }}>(optional — this setup covers one branch)</span>
        </label>
        <input
          id="branchName"
          {...register('branchName')}
          placeholder={gym.gymName.trim() || 'Main Branch'}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}`, color: A.text }}
        />
      </div>

      <div>
        <label htmlFor="address" className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Full location / address</label>
        <input
          id="address"
          {...register('address')}
          aria-invalid={!!errors.address}
          aria-describedby={errors.address ? 'address-error' : undefined}
          placeholder="123 Fitness Ave, Quezon City"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: A.surface2, border: `1px solid ${errors.address ? A.danger : A.border}`, color: A.text }}
        />
        {errors.address && <p id="address-error" className="mt-1 text-xs" style={{ color: A.danger }}>{errors.address.message}</p>}
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Gym logo (optional)</span>
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg" style={{ border: `1px solid ${A.border}` }}>
            <Image src={gym.logoDataUrl || '/stren-logo.png'} alt="Gym logo preview" fill sizes="56px" className="object-contain bg-white" />
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoSelect(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium"
            style={{ color: A.primary, border: `1px solid ${A.border}` }}
          >
            <Upload className="h-3.5 w-3.5" /> {gym.logoDataUrl ? 'Replace' : 'Upload'}
          </button>
          {gym.logoDataUrl && (
            <button type="button" onClick={clearLogo} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium" style={{ color: A.muted }}>
              <X className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-xs" style={{ color: A.muted }}>The Stren mark is used until a logo is uploaded.</p>
      </div>

      <div>
        <label htmlFor="slug" className="mb-1.5 block text-xs font-medium" style={{ color: A.muted }}>Gym URL</label>
        <div className="flex items-center gap-2">
          <span className="text-xs shrink-0" style={{ color: A.muted }}>stren.app/gym/</span>
          <input
            id="slug"
            value={watched.slug ?? ''}
            onChange={(e) => handleSlugChange(e.target.value)}
            aria-invalid={!!errors.slug || slugCheck.status === 'taken'}
            aria-describedby="slug-status"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: A.surface2, border: `1px solid ${errors.slug || slugCheck.status === 'taken' ? A.danger : A.border}`, color: A.text }}
          />
        </div>
        <p id="slug-status" role="status" className="mt-1 text-xs" style={{
          color: slugCheck.status === 'available' ? 'hsl(var(--admin-active-text))' : (slugCheck.status === 'taken' || slugCheck.status === 'invalid') ? A.danger : A.muted,
        }}>
          {slugCheck.status === 'checking' && 'Checking availability…'}
          {slugCheck.status === 'available' && 'This URL is available.'}
          {(slugCheck.status === 'taken' || slugCheck.status === 'invalid') && (slugCheck.message ?? errors.slug?.message)}
          {slugCheck.status === 'error' && slugCheck.message}
          {slugCheck.status === 'idle' && 'Final URL: ' + `stren.app/gym/${watched.slug || 'gym-name'}`}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2">
        <GhostBtn onClick={onSaveDraft}>Save draft</GhostBtn>
        <PrimaryBtn type="submit">Continue</PrimaryBtn>
      </div>
    </form>
  );
}

