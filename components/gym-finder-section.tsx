'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { searchGymsWithFallback, type GymSearchResult } from '@/lib/gym-search';

export function GymFinderSection() {
  const supabase = useMemo(() => createClient(), []);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GymSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestIdRef.current += 1;
      setResults([]);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    const timeout = setTimeout(async () => {
      if (isCancelled || requestId !== requestIdRef.current) return;

      const nextResults = await searchGymsWithFallback(supabase, trimmed);
      if (isCancelled || requestId !== requestIdRef.current) return;

      setResults(nextResults);
      setIsLoading(false);
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [query, supabase]);

  const showResults = query.trim().length >= 2;

  return (
    <section
      id="gym-finder"
      className="py-16 px-6 md:px-12 flex-1 flex flex-col justify-center"
      style={{ backgroundColor: 'var(--color-white)' }}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <p
            className="text-sm font-semibold uppercase tracking-widest mb-3"
            style={{ color: 'var(--color-primary)' }}
          >
            Find a Gym
          </p>
          <h2
            className="text-4xl md:text-5xl font-bold mb-4 leading-tight"
            style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
          >
            Already a member somewhere?
          </h2>
          <p className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>
            Search for your gym to see their page or sign up.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by gym name or code"
              className="w-full rounded-xl border pl-11 pr-4 py-3.5 text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-white)',
                borderColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            />
          </div>

          {showResults && (
            <div className="mt-4 space-y-2">
              {isLoading && (
                <div
                  className="rounded-xl border p-4 text-sm"
                  style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
                >
                  Searching gyms...
                </div>
              )}

              {!isLoading && results.map((gym) => (
                <div
                  key={gym.id}
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {gym.name}
                      </p>
                      {gym.address && (
                        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                          {gym.address}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/gym/${encodeURIComponent(gym.code)}`}
                      className="text-sm font-medium whitespace-nowrap"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))}

              {!isLoading && results.length === 0 && (
                <div
                  className="rounded-xl border p-4 text-sm"
                  style={{ backgroundColor: 'var(--color-background)', borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
                >
                  No gyms found. Ask your gym owner to join Stren.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
