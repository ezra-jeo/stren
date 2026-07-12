'use client';

import Image from 'next/image';
import Link from 'next/link';

export function CTAOverlay() {
  return (
    <section className="relative h-screen flex items-center justify-center px-6 lg:px-12 overflow-hidden">
      <Image
        src="/Landing-CTA.jpg"
        alt="Gym owner"
        fill
        className="object-cover"
        loading="lazy"
        quality={75}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(26,26,26,0.75) 0%, rgba(26,26,26,0.45) 100%)',
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <h2
          className="font-bold mb-4 leading-tight"
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--type-section)',
            color: '#FFFFFF',
          }}
        >
          See what Stren can do for your gym.
        </h2>

        <p
          className="mb-10"
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: 'var(--type-body)',
          }}
        >
          Student-led. We make things happen.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/gyms"
            className="inline-flex items-center justify-center px-8 py-4 rounded-full font-semibold text-sm uppercase tracking-widest transition-all duration-200 hover:scale-105 hover:shadow-xl"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: '#FFFFFF',
              boxShadow: '0 4px 24px rgba(212, 149, 106, 0.35)',
            }}
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-8 py-4 rounded-full font-semibold text-sm uppercase tracking-widest border-2 transition-all duration-200 hover:scale-105 hover:bg-white/10"
            style={{
              borderColor: 'rgba(255,255,255,0.25)',
              color: '#FFFFFF',
            }}
          >
            Create Account
          </Link>
        </div>
      </div>
    </section>
  );
}
