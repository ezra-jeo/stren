'use client';

import Link from 'next/link';
import { track } from '@vercel/analytics';

export function LandingHero() {
  return (
    <section className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      {/* Video Background */}
      <div className="absolute inset-0 w-full h-full bg-gray-900">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/stren-hero-poster.webp"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: 'block' }}
        >
          <source src="/stren-hero.webm" type="video/webm" />
        </video>
      </div>

      {/* Dark overlay for text visibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      {/* Content - truly centered vertically and horizontally */}
      <div className="relative z-10 text-center text-white px-6 max-w-3xl">
        <h1
          className="font-bold mb-6 leading-[1.05] tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--type-hero)',
          }}
        >
          Your gym. Your rules.
        </h1>
        <p
          className="mb-16 text-white/80 max-w-xl mx-auto leading-relaxed"
          style={{ fontSize: 'var(--type-hero-sub)' }}
        >
          Reducing pen-and-paper. Built for gym owners, and members.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/gym-select"
            onClick={() => track('hero_cta_click')}
            className="group inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-sm uppercase tracking-widest transition-all duration-300 hover:gap-4"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              boxShadow: '0 4px 24px rgba(212, 149, 106, 0.35)',
            }}
          >
            <span>Your Gym</span>
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </Link>

          <Link
            href="/signup/admin?from=landing"
            onClick={() => track('hero_register_gym_click')}
            className="inline-flex items-center justify-center px-7 py-4 rounded-full font-semibold text-sm uppercase tracking-widest border transition-colors duration-300 hover:bg-white/10"
            style={{
              borderColor: 'rgba(255,255,255,0.55)',
              color: '#FFFFFF',
            }}
          >
            Register Gym
          </Link>
        </div>
      </div>

      {/* Mouse scroll indicator - like inboyu.com */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10">
        <div 
          className="w-6 h-10 rounded-full border-2 border-white/40 flex justify-center pt-2"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            window.dispatchEvent(new CustomEvent('swiper-next-slide'));
          }}
        >
          <div 
            className="w-1 h-2 bg-white/60 rounded-full"
            style={{
              animation: 'scrollDown 1.5s ease-in-out infinite',
            }}
          />
        </div>
      </div>

      {/* Scroll animation keyframes */}
      <style jsx>{`
        @keyframes scrollDown {
          0% {
            opacity: 1;
            transform: translateY(0);
          }
          100% {
            opacity: 0;
            transform: translateY(12px);
          }
        }
      `}</style>
    </section>
  );
}