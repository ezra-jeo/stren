'use client';

/**
 * "Join a gym" panel on the gym hub (§2.5 path 2, §5 U2).
 *
 * The owner hands out a gym code; members can also search published gyms by
 * name (`search_gyms`, with the same fallback the public finder uses). Either
 * way lands on a confirm card, then `joinGymAction` → a **join request** that
 * sits "waiting for approval" until staff approve it. Unpublished gyms are
 * joinable by exact code (the code is a capability) but never surface in search.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { searchGymsWithFallback, type GymSearchResult } from '@/lib/gym-search';
import { joinGymAction } from '@/lib/auth-actions';
import { GymAvatar } from '@/components/gyms/gym-badges';

type Candidate = { id: string; name: string; code: string };

export function JoinGymPanel({ initialCode, onJoined }: { initialCode?: string | null; onJoined: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GymSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resolvedInitial = useRef(false);

  // Pre-open the confirm card when the hub was reached via `/gyms?join=CODE`.
  useEffect(() => {
    const code = initialCode?.trim();
    if (!code || resolvedInitial.current) return;
    resolvedInitial.current = true;
    void supabase.rpc('get_gym_by_code', { p_code: code }).then(({ data }) => {
      const gym = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
      if (gym && typeof gym.id === 'string' && typeof gym.name === 'string') {
        setSelected({ id: gym.id, name: gym.name, code: String(gym.code ?? code) });
      } else {
        setError(`We couldn't find a gym with the code "${code}". Check the code and try again.`);
      }
    });
  }, [initialCode, supabase]);

  // Debounced name/code search.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const found = await searchGymsWithFallback(supabase, trimmed);
      setResults(found);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, supabase]);

  async function confirmJoin() {
    if (!selected) return;
    setJoining(true);
    setError(null);
    try {
      await joinGymAction(selected.id);
      setJoinedName(selected.name);
      setSelected(null);
      setQuery('');
      setResults([]);
      onJoined();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not send your request. Please try again.');
    } finally {
      setJoining(false);
    }
  }

  if (joinedName) {
    return (
      <div
        className="rounded-2xl border p-5"
        style={{ backgroundColor: 'var(--color-warning-bg)', borderColor: 'var(--color-warning)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Request sent to {joinedName}
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          You&apos;re waiting for approval. Their staff will approve you at the front desk — we&apos;ll add the gym to
          your list once they do.
        </p>
        <button
          type="button"
          onClick={() => setJoinedName(null)}
          className="mt-3 text-sm font-semibold"
          style={{ color: 'var(--color-primary)' }}
        >
          Join another gym
        </button>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        <div className="flex items-center gap-3">
          <GymAvatar name={selected.name} logoUrl={null} />
          <div className="min-w-0">
            <p className="truncate font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {selected.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Code: {selected.code}
            </p>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={confirmJoin}
            disabled={joining}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
          >
            {joining ? 'Sending request…' : 'Request to join'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setError(null);
            }}
            disabled={joining}
            className="rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        Join a gym
      </h2>
      <p className="mt-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Enter the gym code your gym gave you, or search by name.
      </p>
      <div
        className="mt-3 flex items-center gap-2 rounded-lg border px-3"
        style={{ borderColor: 'var(--color-surface)' }}
      >
        <Search size={16} style={{ color: 'var(--color-text-muted)' }} />
        <input
          aria-label="Gym code or name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          placeholder="Gym code or name"
          className="w-full bg-transparent py-2.5 text-sm outline-none"
          style={{ color: 'var(--color-text-primary)' }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {searching && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Searching…
        </p>
      )}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No gyms found. If your gym isn&apos;t listed, ask them for their gym code.
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-3 space-y-1">
          {results.map((gym) => (
            <li key={gym.id}>
              <button
                type="button"
                onClick={() => setSelected({ id: gym.id, name: gym.name, code: gym.code })}
                className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:border-(--color-primary)"
                style={{ borderColor: 'var(--color-surface)' }}
              >
                <GymAvatar name={gym.name} logoUrl={null} size={32} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    {gym.name}
                  </p>
                  <p className="truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {gym.address ?? gym.code}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
