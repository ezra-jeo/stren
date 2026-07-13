'use client';

import Link from 'next/link';
import { Camera, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { joinGymAction, setActiveGymAction } from '@/lib/auth-actions';
import { useAuth } from '@/lib/auth-context';
import { GymAvatar, StatusChip } from '@/components/gyms/gym-badges';

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

export function JoinGymPanel({ initialCode, onJoined }: { initialCode?: string | null; onJoined: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { myGyms } = useAuth();
  const [code, setCode] = useState(initialCode?.trim().toLowerCase() || '');
  const [lookingUp, setLookingUp] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const scannerRef = useRef<Scanner | null>(null);
  const resolvedInitial = useRef(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try { await scanner.stop(); } catch {}
    try { scanner.clear(); } catch {}
  }, []);

  useEffect(() => () => { void stopScanner(); }, [stopScanner]);

  const findGym = useCallback(async (rawCode: string) => {
    await stopScanner();
    setCameraState('idle');
    const normalized = extractGymCodeFromQr(rawCode);
    setError(null);
    setSelected(null);
    if (!normalized) {
      setError('Enter a valid gym code.');
      return;
    }
    setCode(normalized);
    setLookingUp(true);
    const { data, error: lookupError } = await supabase.rpc('get_gym_by_code', { p_code: normalized });
    setLookingUp(false);
    if (lookupError) {
      setError('We could not look up that gym right now. Please try again.');
      return;
    }
    const gym = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
    if (!gym || typeof gym.id !== 'string' || typeof gym.name !== 'string') {
      setError('We could not find a gym with that code. Check it and try again.');
      return;
    }
    setSelected({
      id: gym.id,
      name: gym.name,
      code: typeof gym.code === 'string' ? gym.code : normalized,
      address: typeof gym.address === 'string' ? gym.address : null,
      logoUrl: typeof gym.logo_url === 'string' ? gym.logo_url : null,
    });
  }, [stopScanner, supabase]);

  useEffect(() => {
    if (!initialCode || resolvedInitial.current) return;
    resolvedInitial.current = true;
    void findGym(initialCode);
  }, [findGym, initialCode]);

  async function startScanner() {
    if (cameraState === 'starting' || cameraState === 'scanning') return;
    setError(null);
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
              setError('That QR code is not a Stren gym code. Try another code or enter it below.');
              return;
            }
            void findGym(scannedCode);
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

  async function confirmJoin() {
    if (!selected || joining) return;
    setJoining(true);
    setError(null);
    try {
      const result = await joinGymAction(selected.id);
      onJoined();
      if (result.status === 'active') {
        const current = myGyms.find((gym) => gym.gymId === selected.id);
        const { role } = await setActiveGymAction(selected.id);
        router.push((current?.role || role) === 'member' ? '/member' : '/admin');
        router.refresh();
        return;
      }
      setJoinedName(selected.name);
      setSelected(null);
    } catch {
      setError('We could not send your request. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  const existing = selected ? myGyms.find((gym) => gym.gymId === selected.id) : null;

  if (joinedName) {
    return (
      <section role="status" className="rounded-2xl border p-6 text-center" style={{ backgroundColor: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)' }}>
        <h2 className="font-serif text-2xl font-semibold text-(--color-text-primary)">Request sent!</h2>
        <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Request sent to <strong>{joinedName}</strong>. We’ll let you know once the gym approves it.</p>
      </section>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6" style={{ borderColor: 'var(--color-surface)' }}>
      <div>
        <h2 className="font-serif text-xl font-semibold text-(--color-text-primary)">Join a gym</h2>
        <p className="mt-1 text-sm leading-6 text-(--color-text-secondary)">Use the Stren QR code from your gym, or enter its gym code.</p>
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--color-surface)' }}>
        <button
          type="button"
          onClick={() => void startScanner()}
          disabled={cameraState === 'starting' || cameraState === 'scanning'}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border font-semibold text-(--color-text-primary) disabled:opacity-60"
          style={{ borderColor: 'var(--color-primary)' }}
        >
          <Camera size={18} aria-hidden="true" />
          {cameraState === 'starting' ? 'Starting camera…' : cameraState === 'scanning' ? 'Scanning…' : 'Scan gym QR code'}
        </button>
        <p className="mt-2 text-xs leading-5 text-(--color-text-muted)">We only use the camera while this scanner is open.</p>
        {(cameraState === 'starting' || cameraState === 'scanning') && <div id="gym-qr-reader" className="mt-3 min-h-52 overflow-hidden rounded-lg bg-black" />}
        {cameraState === 'denied' && <p role="alert" className="mt-2 text-sm text-(--color-danger)">Camera permission was denied. Allow it in your browser settings, or enter the gym code below.</p>}
        {cameraState === 'unavailable' && <p role="alert" className="mt-2 text-sm text-(--color-danger)">No usable camera was found. Enter the gym code below.</p>}
        {cameraState === 'unsupported' && <p role="alert" className="mt-2 text-sm text-(--color-danger)">This browser cannot scan QR codes here. Enter the gym code below.</p>}
      </div>

      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-(--color-text-muted)"><span className="h-px flex-1 bg-(--color-surface)" />or<span className="h-px flex-1 bg-(--color-surface)" /></div>

      <form onSubmit={(event) => { event.preventDefault(); void findGym(code); }} className="grid gap-3">
        <label htmlFor="gym-code" className="text-sm font-semibold text-(--color-text-primary)">Gym code</label>
        <input
          id="gym-code"
          value={code}
          onChange={(event) => { setCode(event.target.value.toLowerCase()); setError(null); }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={lookingUp || joining}
          className="min-h-12 rounded-xl border px-4 outline-none focus:border-(--color-primary) focus:ring-3 focus:ring-(--color-primary-glow)"
          placeholder="e.g. iron-house"
        />
        <button type="submit" disabled={lookingUp || joining || !code.trim()} className="min-h-12 rounded-xl bg-(--color-primary) font-bold text-white disabled:opacity-60" aria-busy={lookingUp}>
          {lookingUp ? 'Finding gym…' : 'Find gym'}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-(--color-danger) bg-(--color-danger-bg) px-4 py-3 text-sm text-(--color-text-primary)">{error}</p>}

      {selected && (
        <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--color-primary)', backgroundColor: 'var(--color-background)' }}>
          <div className="flex items-start gap-3">
            <GymAvatar name={selected.name} logoUrl={selected.logoUrl} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-(--color-text-primary)">{selected.name}</p>
              {selected.address && <p className="mt-1 flex items-center gap-1 text-xs text-(--color-text-muted)"><MapPin size={13} />{selected.address}</p>}
              {existing && <div className="mt-2"><StatusChip status={existing.status} /></div>}
            </div>
          </div>
          {!existing && <button type="button" onClick={() => void confirmJoin()} disabled={joining} className="mt-4 min-h-12 w-full rounded-xl bg-(--color-primary) font-bold text-white disabled:opacity-60">{joining ? 'Sending request…' : 'Request to join'}</button>}
          {existing?.status === 'pending' && <p className="mt-4 text-sm text-(--color-text-secondary)">Your request is waiting for gym staff approval.</p>}
          {existing?.status === 'active' && <button type="button" onClick={() => void setActiveGymAction(existing.gymId).then(({ role }) => { router.push(role === 'member' ? '/member' : '/admin'); router.refresh(); })} className="mt-4 min-h-12 w-full rounded-xl bg-(--color-primary) font-bold text-white">Open gym</button>}
          {existing?.status === 'rejected' && <p className="mt-4 text-sm text-(--color-text-secondary)">This request was not approved. Ask the gym’s staff if you need help.</p>}
        </div>
      )}

      <p className="text-center text-xs leading-5 text-(--color-text-muted)">
        Can’t find your gym? Ask its staff for its Stren QR code, or{' '}
        <Link href="/for-gym-owners" className="font-semibold text-(--color-primary-dark)">tell your gym about Stren</Link>.
      </p>
    </section>
  );
}
