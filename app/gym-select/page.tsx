'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, QrCode, HelpCircle, Building2, X, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { searchGymsWithFallback, type GymSearchResult } from '@/lib/gym-search';

const STORAGE_KEY = 'stren-selected-gym';

type SavedGym = {
  id: string;
  name: string;
  code: string;
};

export default function GymSelectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  const [rememberedGym, setRememberedGym] = useState<SavedGym | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GymSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [isSignupIntent, setIsSignupIntent] = useState(false);

  const getGymDestination = (gymCode: string) => {
    if (isSignupIntent) {
      return `/gym/${encodeURIComponent(gymCode)}/signup`;
    }
    return `/gym/${encodeURIComponent(gymCode)}/login?from=select`;
  };

  // Load remembered gym from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const urlParams = new URLSearchParams(window.location.search);
    setIsSignupIntent(urlParams.get('intent') === 'signup');
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setRememberedGym(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Focus input when entering search mode
  useEffect(() => {
    if (searchMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchMode]);

  // Lock body scroll when QR modal is open
  useEffect(() => {
    document.body.style.overflow = qrModalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [qrModalOpen]);

  // Gym search with debounce
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

  const handleGymSelect = (gym: GymSearchResult | SavedGym) => {
    const toSave: SavedGym = { id: gym.id, name: gym.name, code: gym.code };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    setRememberedGym(toSave);
    setSearchMode(false);
    setQuery('');
    setResults([]);
    router.push(getGymDestination(toSave.code));
  };

  const handleContinueToGym = (gym: SavedGym) => {
    router.push(getGymDestination(gym.code));
  };

  const handleEnterSearchMode = () => setSearchMode(true);

  const handleExitSearchMode = () => {
    setSearchMode(false);
    setQuery('');
    setResults([]);
  };

  const showResults = searchMode && query.trim().length >= 2;

  if (!mounted) return null;

  return (
    <>
      <div 
        className="min-h-[100dvh] flex flex-col md:items-center md:justify-center px-6 py-8 md:px-4 relative overflow-hidden"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        {/* Decorative background elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div 
            className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full"
            style={{ 
              background: 'radial-gradient(circle, var(--color-primary-glow) 0%, transparent 60%)',
              opacity: 0.7,
            }}
          />
          <div 
            className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full"
            style={{ 
              background: 'radial-gradient(circle, var(--color-primary-glow) 0%, transparent 60%)',
              opacity: 0.5,
            }}
          />
          <div 
            className="absolute top-1/4 -left-20 w-64 h-64 rounded-full hidden md:block"
            style={{ 
              background: 'radial-gradient(circle, var(--color-surface) 0%, transparent 70%)',
              opacity: 0.6,
            }}
          />
        </div>

        {/* 
          Main Container
          - Mobile: No card, full-bleed layout (Canvas-style)
          - Desktop: White card with shadow
        */}
        <div 
          className="relative z-10 w-full max-w-[420px] flex flex-col flex-1 md:flex-initial md:rounded-3xl md:p-10 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ 
            // Desktop-only card styles applied via media query in className
          }}
        >
          {/* Desktop-only card background */}
          <div 
            className="absolute inset-0 hidden md:block rounded-3xl"
            style={{ 
              backgroundColor: 'var(--color-white)',
              boxShadow: '0 4px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
            }}
          />

          {/* Content wrapper */}
          <div className="relative z-10 flex flex-col flex-1 md:flex-initial">
            <div className="mb-4 md:mb-6">
              <Link
                href="/landing"
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-black/5"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <ArrowLeft size={14} />
                Back to Stren
              </Link>
            </div>

            {/* Branding Section - positioned in upper area on mobile */}
            <div className="flex flex-col items-center justify-center text-center pt-20 pb-8 md:pt-0 md:pb-0 md:mb-10">
              {/* Logo with circular badge */}
              <div className="relative mb-5">
                {/* Warm circular badge behind logo */}
                <div 
                  className="absolute inset-0 rounded-full scale-[1.4]"
                  style={{ 
                    background: 'linear-gradient(135deg, var(--color-primary-glow) 0%, rgba(212, 149, 106, 0.08) 100%)',
                  }}
                />
                {/* Subtle glow */}
                <div 
                  className="absolute inset-0 blur-2xl scale-[2]"
                  style={{ 
                    background: 'var(--color-primary-glow)',
                    opacity: 0.4,
                  }}
                />
                <div className="relative w-[125px] h-[125px] md:w-[100px] md:h-[100px]">
                  <Image
                    src="/stren-logo.png"
                    alt="Stren"
                    fill
                    className="object-contain drop-shadow-md"
                    priority
                  />
                </div>
              </div>

              {/* Title */}
              <h1
                className="text-3xl font-bold mb-2"
                style={{
                  fontFamily: 'var(--font-heading)',
                  color: 'var(--color-primary)',
                }}
              >
                Stren
              </h1>

              {/* Tagline */}
              <p
                className="text-sm"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Your gym. Your rules.
              </p>
            </div>

            {/* Spacer - creates natural gap on mobile, pushes buttons to lower area (not all the way down) */}
            <div className="flex-1 min-h-[60px] md:hidden" />

            {/* Action Section */}
            <div className="md:space-y-3 pb-15 md:pb-0">
              <div className="space-y-3">
                {/* Remembered Gym Button */}
                {rememberedGym && !searchMode && (
                  <button
                    type="button"
                    onClick={() => handleContinueToGym(rememberedGym)}
                    className="w-full flex items-center justify-center gap-3 px-5 py-4 rounded-2xl font-semibold text-[15px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
                      color: 'var(--color-white)',
                      boxShadow: '0 4px 16px rgba(212, 149, 106, 0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
                    }}
                  >
                    <Building2 size={18} />
                    <span>{rememberedGym.name}</span>
                  </button>
                )}

                {/* Find Your Gym Button / Search Input */}
                {!searchMode ? (
                  <button
                    type="button"
                    onClick={handleEnterSearchMode}
                    className="w-full px-5 py-4 rounded-2xl font-semibold text-[15px] border-2 transition-all duration-200 hover:scale-[1.02] hover:border-[var(--color-primary-light)] active:scale-[0.98]"
                    style={{
                      borderColor: 'var(--color-surface)',
                      backgroundColor: 'var(--color-white)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    Find your gym
                  </button>
                ) : (
                  <div className="space-y-3">
                    {/* Search Input */}
                    <div className="relative">
                      <Search
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--color-text-muted)' }}
                      />
                      <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by gym name or code"
                        className="w-full rounded-2xl border-2 pl-11 pr-4 py-4 text-[15px] outline-none transition-all duration-200"
                        style={{
                          backgroundColor: 'var(--color-white)',
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-text-primary)',
                        }}
                      />
                    </div>

                    {/* Search Results */}
                    {showResults && (
                      <div className="space-y-2 max-h-[180px] overflow-y-auto">
                        {isLoading && (
                          <div
                            className="rounded-xl p-3 text-sm"
                            style={{
                              backgroundColor: 'var(--color-white)',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            Searching gyms...
                          </div>
                        )}

                        {!isLoading && results.map((gym) => (
                          <button
                            key={gym.id}
                            type="button"
                            onClick={() => handleGymSelect(gym)}
                            className="w-full rounded-xl p-3 text-left transition-all duration-150 hover:bg-[var(--color-primary-glow)] active:scale-[0.98]"
                            style={{ backgroundColor: 'var(--color-white)' }}
                          >
                            <p
                              className="text-[15px] font-semibold truncate"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {gym.name}
                            </p>
                            {gym.address && (
                              <p
                                className="text-xs mt-0.5 truncate"
                                style={{ color: 'var(--color-text-secondary)' }}
                              >
                                {gym.address}
                              </p>
                            )}
                          </button>
                        ))}

                        {!isLoading && results.length === 0 && (
                          <div
                            className="rounded-xl p-3 text-sm"
                            style={{
                              backgroundColor: 'var(--color-white)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            No gyms found. Try a different name or code.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cancel */}
                    <button
                      type="button"
                      onClick={handleExitSearchMode}
                      className="w-full py-2 text-sm font-medium transition-colors duration-150 hover:text-[var(--color-text-primary)]"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Footer Links */}
              {!searchMode && (
                <div className="flex items-center justify-center gap-5 pt-4 md:pt-0">
                  <button
                    type="button"
                    onClick={() => setQrModalOpen(true)}
                    className="flex items-center gap-2 text-sm font-medium transition-all duration-150 hover:text-[var(--color-primary)]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <QrCode size={16} />
                    <span>QR Login</span>
                  </button>
                  <div 
                    className="w-px h-4"
                    style={{ backgroundColor: 'var(--color-surface)' }}
                  />
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-medium transition-all duration-150 hover:text-[var(--color-primary)]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <HelpCircle size={16} />
                    <span>Help</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QR Login Modal */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 ${
          qrModalOpen ? 'visible' : 'invisible'
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            qrModalOpen ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setQrModalOpen(false)}
        />

        {/* Modal Panel */}
        <div
          className={`absolute inset-x-0 bottom-0 transition-transform duration-300 ease-out ${
            qrModalOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ 
            backgroundColor: 'var(--color-white)',
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
            minHeight: '70vh',
            maxHeight: '90vh',
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div 
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: 'var(--color-light-gray)' }}
            />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3">
            <h2
              className="text-lg font-semibold"
              style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--color-text-primary)',
              }}
            >
              QR Login
            </h2>
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-150 hover:bg-black/5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex flex-col items-center justify-center text-center px-8 py-10">
            <div 
              className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{ 
                background: 'linear-gradient(135deg, var(--color-primary-glow) 0%, rgba(212, 149, 106, 0.15) 100%)',
              }}
            >
              <QrCode size={48} style={{ color: 'var(--color-primary)' }} />
            </div>
            
            <h3
              className="text-xl font-bold mb-3"
              style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--color-text-primary)',
              }}
            >
              Coming Soon
            </h3>
            
            <p
              className="text-sm leading-relaxed max-w-[280px] mb-6"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Scan your gym&apos;s QR code to instantly log in. This feature is currently in development.
            </p>

            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="px-8 py-3 rounded-full font-semibold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
