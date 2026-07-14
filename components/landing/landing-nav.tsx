'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { track } from '@vercel/analytics';
import { useAuth } from '@/lib/auth-context';
import { IntentLink } from '@/components/layout/intent-link';

const menuLinks = [
  { label: 'Getting Started', href: '#features' },
  { label: 'About Stren', href: '#about' },
  { label: 'Find a Location', href: '#gym-finder' },
  { label: 'Contact Us', href: '#contact' },
  { label: 'FAQ', href: '#' },
];

export function LandingNav() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    const handleSwiperChange = (e: CustomEvent<{ index: number }>) => {
      setScrolled(e.detail.index > 0);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('swiper-slide-change', handleSwiperChange as EventListener);
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('swiper-slide-change', handleSwiperChange as EventListener);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) setMenuOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled ? 'rgba(255,255,255,0.97)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          <div 
            className="flex items-center justify-between h-16 transition-all duration-300"
            style={{
              borderBottom: scrolled 
                ? '1px solid var(--color-surface)' 
                : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* Left: Hamburger */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                disabled={!hydrated}
                className="flex items-center justify-center w-10 h-10 -ml-2 rounded-lg transition-colors duration-200 hover:bg-black/5"
                style={{ color: scrolled ? 'var(--color-text-primary)' : '#FFFFFF' }}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="nav-menu-panel"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>

            {/* Center: Logo */}
            <Link href="/landing" className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
              <div className="h-8 w-8 relative">
                <Image src="/stren-logo.png" alt="Stren" fill sizes="32px" className="object-contain" loading="eager" priority />
              </div>
              <span
                className="text-xl font-bold transition-colors duration-300"
                style={{
                  color: scrolled ? 'var(--color-primary)' : '#FFFFFF',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                Stren
              </span>
            </Link>

            {/* Right: Gym owner entry */}
            <div className="hidden sm:block">
              <Link
                href="/for-gym-owners"
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-all duration-200 hover:scale-[1.02]"
                style={{
                  backgroundColor: scrolled ? 'var(--color-primary)' : 'rgba(255,255,255,0.16)',
                  color: '#FFFFFF',
                  border: scrolled ? 'none' : '1px solid rgba(255,255,255,0.28)',
                }}
              >
                For Gym Owners
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Menu Panel */}
      <div
        id="nav-menu-panel"
        className={`fixed inset-0 z-[60] transition-all duration-300 ${
          menuOpen ? 'visible' : 'invisible'
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!menuOpen}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={closeMenu}
          onKeyDown={(e) => e.key === 'Enter' && closeMenu()}
          role="button"
          tabIndex={0}
          aria-label="Close menu"
        />

        {/* Slide-in Panel */}
        <div
          className={`absolute top-0 left-0 h-full w-[min(22rem,90vw)] bg-white shadow-2xl transition-transform duration-300 ease-out ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-5 h-16 border-b" style={{ borderColor: 'var(--color-surface)' }}>
            <Link href="/landing" className="flex items-center gap-2" onClick={closeMenu}>
              <div className="h-7 w-7 relative">
                <Image src="/stren-logo.png" alt="Stren" fill sizes="28px" className="object-contain" />
              </div>
              <span
                className="text-lg font-bold"
                style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-heading)' }}
              >
                Stren
              </span>
            </Link>
            <button
              type="button"
              onClick={closeMenu}
              className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-200 hover:bg-gray-100"
              aria-label="Close menu"
            >
              <X className="h-5 w-5 text-gray-700" />
            </button>
          </div>

          {/* Menu content */}
          <div className="flex flex-col h-[calc(100%-4rem)] overflow-y-auto">
            <div className="flex-1 py-4">
              {menuLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => {
                    track('nav_link_click', { target: link.label });
                    closeMenu();
                  }}
                  className="block px-6 py-4 text-base font-medium transition-colors duration-150 hover:bg-gray-50"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {link.label}
                </a>
              ))}

              <div className="my-4 mx-6 border-t" style={{ borderColor: 'var(--color-surface)' }} />

              <div className="px-6 space-y-3">
                {user ? (
                  <Link
                    href="/gyms"
                    onClick={closeMenu}
                    className="block w-full rounded-full px-6 py-3.5 text-center text-sm font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.02]"
                    style={{ backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }}
                  >
                    Open Stren
                  </Link>
                ) : (
                  <>
                    <IntentLink
                      href="/auth?mode=signin"
                      transitionKind="public-auth"
                      onClick={closeMenu}
                      className="block w-full text-center px-6 py-3.5 rounded-full font-semibold text-sm uppercase tracking-wider transition-all duration-200 hover:scale-[1.02]"
                      style={{ backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }}
                    >
                      Sign In
                    </IntentLink>
                    <IntentLink
                      href="/auth?mode=signup"
                      transitionKind="public-auth"
                      onClick={closeMenu}
                      className="block w-full text-center px-6 py-3.5 rounded-full font-semibold text-sm uppercase tracking-wider border-2 transition-all duration-200 hover:scale-[1.02]"
                      style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                    >
                      Create Account
                    </IntentLink>
                  </>
                )}
                <Link
                  href="/for-gym-owners"
                  onClick={closeMenu}
                  className="block w-full text-center px-6 py-3.5 rounded-full font-semibold text-sm uppercase tracking-wider border-2 transition-all duration-200 hover:scale-[1.02]"
                  style={{
                    borderColor: 'var(--color-primary)',
                    color: 'var(--color-primary)',
                  }}
                >
                  Bring Stren to Your Gym
                </Link>
              </div>
            </div>

            <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--color-surface)' }}>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                © 2024 Stren. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
