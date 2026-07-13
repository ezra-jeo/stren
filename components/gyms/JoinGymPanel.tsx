'use client';

import Link from 'next/link';
import { Bookmark, BookmarkCheck, Camera, MapPin, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import {
  saveGymAction,
  setActiveGymAction,
  verifyMembershipAction,
} from '@/lib/auth-actions';
import { useAuth } from '@/lib/auth-context';
import { GymAvatar } from '@/components/gyms/gym-badges';

type Candidate = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  logoUrl: string | null;
};

type Scanner = { stop: () => Promise<void>; clear: () => void };
type CameraState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unavailable' | 'unsupported';

const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{2,31}$/;

export function extractGymCodeFromQr(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return null;
  let candidate = raw;
  try {
    const url = new URL(raw, 'https://stren.app');
    candidate = url.searchParams.get('gym') || url.pathname.match(/^\/gym\/([^/]+)/i)?.[1] || raw;
  } catch {
    candidate = raw;
  }
  try { candidate = decodeURIComponent(candidate); } catch {}
  const normalized = candidate.trim().toLowerCase();
  return CODE_PATTERN.test(normalized) ? normalized : null;
}

function toCandidate(row: Record<string, unknown>, fallbackCode = ''): Candidate | null {
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null;
  return {
    id: row.id,
    name: row.name,
    code: typeof row.code === 'string' ? row.code : fallbackCode,
    address: typeof row.address === 'string' ? row.address : null,
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null,
  };
}

export function JoinGymPanel({
  initialCode,
  onJoined,
  onSaved,
  savedGymIds,
}: {
  initialCode?: string | null;
  onJoined: () => void;
  onSaved?: () => void;
  savedGymIds?: ReadonlySet<string>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { myGyms } = useAuth();
  const [query, setQuery] = useState(initialCode?.trim().toLowerCase() || '');
  const [lookingUp, setLookingUp] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [verificationName, setVerificationName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const scannerRef = useRef<Scanner | null>(null);
  const resolvedInitial = useRef(false);

  useEffect(() => {
    if (savedGymIds) setSavedIds(new Set(savedGymIds));
  }, [savedGymIds]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try { await scanner.stop(); } catch {}
    try { scanner.clear(); } catch {}
  }, []);

  useEffect(() => () => { void stopScanner(); }, [stopScanner]);

  const searchGyms = useCallback(async (rawQuery: string) => {
    if (lookingUp) return;
    await stopScanner();
    setCameraState('idle');
    const trimmed = rawQuery.trim();
    const normalized = trimmed.toLowerCase();
    setError(null);
    setStatusMessage(null);
    setVerificationName(null);
    setResults([]);
    if (trimmed.length < 2) {
      setError('Enter at least two characters to search for a gym.');
      return;
    }
    setQuery(trimmed);
    setLookingUp(true);
    try {
      // A valid shared code must keep working for unpublished gyms. Public name
      // and location search intentionally returns published gyms only.
      if (CODE_PATTERN.test(normalized)) {
        const exact = await supabase.rpc('get_gym_by_code', { p_code: normalized });
        const exactRow = exact.data && typeof exact.data === 'object' && !Array.isArray(exact.data)
          ? toCandidate(exact.data as Record<string, unknown>, normalized)
          : null;
        if (exactRow) {
          setResults([exactRow]);
          return;
        }
      }

      const searched = await supabase.rpc('search_gyms', { p_query: trimmed });
      if (searched.error) {
        setError('We could not search for gyms right now. Please try again.');
        return;
      }
      const candidates = Array.isArray(searched.data)
        ? searched.data.map((row) => toCandidate(row as Record<string, unknown>)).filter((row): row is Candidate => !!row)
        : [];
      if (candidates.length === 0) {
        setError('We could not find a gym matching that search. Check the name, location, or code and try again.');
        return;
      }
      setResults(candidates);
    } catch {
      setError('We could not search for gyms right now. Please try again.');
    } finally {
      setLookingUp(false);
    }
  }, [lookingUp, stopScanner, supabase]);

  useEffect(() => {
    if (!initialCode || resolvedInitial.current) return;
    resolvedInitial.current = true;
    void searchGyms(initialCode);
  }, [initialCode, searchGyms]);

  async function startScanner() {
    if (cameraState === 'starting' || cameraState === 'scanning') return;
    setError(null);
    setStatusMessage(null);
    setCameraState('starting');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      setCameraState('scanning');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const scanner = new Html5Qrcode('gym-qr-reader') as unknown as Scanner & {
        start: (
          camera: { facingMode: string },
          config: { fps: number; qrbox: { width: number; height: number } },
          onSuccess: (decodedText: string) => void,
          onError: () => void,
        ) => Promise<void>;
      };
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          const scannedCode = extractGymCodeFromQr(decodedText);
          void stopScanner().then(() => {
            setCameraState('idle');
            if (!scannedCode) {
              setError('That QR code is not a Stren gym code. Try another code or search below.');
              return;
            }
            void searchGyms(scannedCode);
          });
        },
        () => {},
      );
    } catch (caught) {
      await stopScanner();
      const message = caught instanceof Error ? caught.message : String(caught);
      if (/permission|notallowed/i.test(message)) setCameraState('denied');
      else if (/notfound|camera|device/i.test(message)) setCameraState('unavailable');
      else setCameraState('unsupported');
    }
  }

  async function verifyMembership(candidate: Candidate) {
    if (verifyingId) return;
    setVerifyingId(candidate.id);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await verifyMembershipAction(candidate.id);
      onJoined();
      if (result.status === 'active') {
        await setActiveGymAction(candidate.id);
        router.push(result.role === 'member' ? '/member' : '/admin');
        router.refresh();
        return;
      }
      setVerificationName(candidate.name);
      setResults([]);
    } catch {
      setError('We could not start membership verification. Please try again.');
    } finally {
      setVerifyingId(null);
    }
  }

  async function toggleSaved(candidate: Candidate) {
    if (savingId) return;
    const shouldSave = !savedIds.has(candidate.id);
    setSavingId(candidate.id);
    setError(null);
    try {
      await saveGymAction(candidate.id, shouldSave);
      setSavedIds((current) => {
        const next = new Set(current);
        shouldSave ? next.add(candidate.id) : next.delete(candidate.id);
        return next;
      });
      setStatusMessage(shouldSave ? `${candidate.name} saved.` : `${candidate.name} removed from saved gyms.`);
      onSaved?.();
    } catch {
      setError('We could not update your saved gyms right now.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section aria-labelledby="gym-discovery-title" className="space-y-5 rounded-3xl border border-(--color-surface) bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-(--color-primary-dark)">Gym discovery</p>
        <h2 id="gym-discovery-title" className="mt-1 font-serif text-2xl font-semibold text-(--color-text-primary)">Find your gym</h2>
        <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Search public gyms by name or location, enter a gym code, or scan the QR code provided by your gym.</p>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void searchGyms(query); }} role="search" className="grid gap-3">
        <label htmlFor="gym-search" className="text-sm font-semibold text-(--color-text-primary)">Search gyms</label>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-(--color-text-muted)" aria-hidden="true" />
          <input
            id="gym-search"
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setError(null); }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={lookingUp || !!verifyingId}
            className="min-h-12 w-full rounded-xl border border-(--color-surface) bg-(--color-background) py-3 pl-11 pr-4 outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)"
            placeholder="Search by gym name, location, or code"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="submit" disabled={lookingUp || !!verifyingId || !query.trim()} className="min-h-12 rounded-xl bg-(--color-primary) px-4 font-bold text-white disabled:opacity-60" aria-busy={lookingUp}>
            {lookingUp ? 'Searching…' : 'Search gyms'}
          </button>
          <button type="button" onClick={() => void startScanner()} disabled={cameraState === 'starting' || cameraState === 'scanning' || lookingUp} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-(--color-primary) px-4 font-semibold text-(--color-text-primary) disabled:opacity-60">
            <Camera size={18} aria-hidden="true" />
            {cameraState === 'starting' ? 'Starting camera…' : cameraState === 'scanning' ? 'Scanning…' : 'Scan gym QR code'}
          </button>
        </div>
      </form>

      <p className="text-xs leading-5 text-(--color-text-muted)">Camera access is requested only after you choose to scan, and only while the scanner is open.</p>
      {(cameraState === 'starting' || cameraState === 'scanning') && <div id="gym-qr-reader" className="min-h-52 overflow-hidden rounded-xl bg-black" />}
      {cameraState === 'denied' && <p role="alert" className="text-sm text-(--color-danger)">Camera permission was denied. Allow it in your browser settings, or use gym search instead.</p>}
      {cameraState === 'unavailable' && <p role="alert" className="text-sm text-(--color-danger)">No usable camera was found. Use gym search instead.</p>}
      {cameraState === 'unsupported' && <p role="alert" className="text-sm text-(--color-danger)">This browser cannot scan QR codes here. Use gym search instead.</p>}

      {error && <p role="alert" className="rounded-xl border border-(--color-danger) bg-(--color-danger-bg) px-4 py-3 text-sm text-(--color-text-primary)">{error}</p>}
      {statusMessage && <p role="status" className="rounded-xl bg-(--color-success-bg) px-4 py-3 text-sm text-(--color-text-primary)">{statusMessage}</p>}

      {verificationName && (
        <div role="status" className="rounded-2xl border border-(--color-primary) bg-(--color-primary-glow) p-5">
          <h3 className="font-serif text-xl font-semibold text-(--color-text-primary)">Membership verification started</h3>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">We’re waiting for <strong>{verificationName}</strong> to confirm your membership. You can track this here and verify with other gyms too.</p>
        </div>
      )}

      {results.length > 0 && (
        <div aria-label="Gym search results" className="space-y-3">
          {results.map((candidate) => {
            const existing = myGyms.find((gym) => gym.gymId === candidate.id);
            const saved = savedIds.has(candidate.id);
            return (
              <article key={candidate.id} className="rounded-2xl border border-(--color-primary) bg-(--color-background) p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <GymAvatar name={candidate.name} logoUrl={candidate.logoUrl} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-(--color-text-primary)">{candidate.name}</h3>
                    {candidate.address && <p className="mt-1 flex items-center gap-1 text-xs text-(--color-text-muted)"><MapPin size={13} aria-hidden="true" />{candidate.address}</p>}
                  </div>
                  <button type="button" onClick={() => void toggleSaved(candidate)} disabled={savingId === candidate.id} aria-label={saved ? `Remove ${candidate.name} from saved gyms` : `Save ${candidate.name}`} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-(--color-surface) bg-white text-(--color-primary-dark) disabled:opacity-50">
                    {saved ? <BookmarkCheck size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
                  </button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Link href={`/gym/${candidate.code}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-(--color-primary) px-4 font-semibold text-(--color-text-primary)">View gym profile</Link>
                  {!existing && <button type="button" onClick={() => void verifyMembership(candidate)} disabled={!!verifyingId} className="min-h-12 rounded-xl bg-(--color-primary) px-4 font-bold text-white disabled:opacity-60">{verifyingId === candidate.id ? 'Checking membership…' : 'I’m already a member'}</button>}
                  {existing?.status === 'pending' && <p className="sm:col-span-2 text-sm text-(--color-text-secondary)">We’re waiting for the gym to confirm your membership.</p>}
                  {existing?.status === 'rejected' && <p className="sm:col-span-2 text-sm text-(--color-text-secondary)">The gym needs to check your member record. Open its profile for public contact details.</p>}
                  {existing?.status === 'active' && <button type="button" onClick={() => void setActiveGymAction(existing.gymId).then(({ role }) => { router.push(role === 'member' ? '/member' : '/admin'); router.refresh(); })} className="min-h-12 rounded-xl bg-(--color-primary) px-4 font-bold text-white">Open gym</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="text-center text-xs leading-5 text-(--color-text-muted)">
        Can’t find your gym? Ask its staff for its Stren QR code, or{' '}
        <Link href="/for-gym-owners" className="font-semibold text-(--color-primary-dark)">tell your gym about Stren</Link>.
      </p>
    </section>
  );
}
