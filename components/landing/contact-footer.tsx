'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';
import { track } from '@vercel/analytics';
import { useAuth } from '@/lib/auth-context';
import { IntentLink } from '@/components/layout/intent-link';

export function ContactFooter() {
  const { user } = useAuth();
  const authLink = user
    ? { label: 'Open Stren', href: '/gyms' }
    : { label: 'Sign In', href: '/auth?mode=signin' };
  return (
    <footer
      id="contact"
      className="border-t pt-16 pb-10 px-6 lg:px-12"
      style={{
        backgroundColor: 'var(--color-charcoal)',
        borderColor: 'var(--color-graphite)',
      }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          <div>
            <Link href="/landing" className="inline-flex items-center gap-2 mb-4">
              <Image src="/stren-logo.png" alt="Stren" width={32} height={32} className="object-contain" />
              <span
                className="text-xl font-bold"
                style={{
                  color: 'var(--color-primary)',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                Stren
              </span>
            </Link>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--color-gray)' }}>
              Gym management, simplified. Built for independent gyms in the Philippines.
            </p>
          </div>

          <div>
            <h4
              className="text-xs font-semibold uppercase tracking-[0.15em] mb-5"
              style={{ color: 'var(--color-light-gray)' }}
            >
              Contact
            </h4>
            <div className="space-y-3">
              <a
                href="mailto:bonakainu@gmail.com"
                onClick={() => track('contact_click', { type: 'email' })}
                className="flex items-center gap-3 text-sm transition-colors duration-200 hover:opacity-80"
                style={{ color: 'var(--color-gray)' }}
              >
                <Mail size={15} style={{ color: 'var(--color-primary)' }} />
                bonakainu@gmail.com
              </a>
              <a
                href="tel:+639695637557"
                onClick={() => track('contact_click', { type: 'phone' })}
                className="flex items-center gap-3 text-sm transition-colors duration-200 hover:opacity-80"
                style={{ color: 'var(--color-gray)' }}
              >
                <Phone size={15} style={{ color: 'var(--color-primary)' }} />
                +63 969 563 7557
              </a>
              <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-gray)' }}>
                <MapPin size={15} style={{ color: 'var(--color-primary)' }} />
                Metro Manila, Philippines
              </div>
            </div>
          </div>

          <div>
            <h4
              className="text-xs font-semibold uppercase tracking-[0.15em] mb-5"
              style={{ color: 'var(--color-light-gray)' }}
            >
              Links
            </h4>
            <div className="space-y-3">
              {[
                { label: 'About Stren', href: '#about' },
                { label: 'Features', href: '#features' },
                { label: 'Contact Us', href: '#contact' },
                authLink,
                { label: 'Bring Stren to Your Gym', href: '/for-gym-owners' },
              ].map((link) =>
                link.href.startsWith('#') ? (
                  <a
                    key={link.label}
                    href={link.href}
                    className="block text-sm transition-colors duration-200 hover:opacity-80"
                    style={{ color: 'var(--color-gray)' }}
                  >
                    {link.label}
                  </a>
                ) : link.href.startsWith('/auth') ? (
                  <IntentLink
                    key={link.label}
                    href={link.href}
                    transitionKind="public-auth"
                    className="block text-sm transition-colors duration-200 hover:opacity-80"
                    style={{ color: 'var(--color-gray)' }}
                  >
                    {link.label}
                  </IntentLink>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="block text-sm transition-colors duration-200 hover:opacity-80"
                    style={{ color: 'var(--color-gray)' }}
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="border-t pt-6" style={{ borderColor: 'var(--color-graphite)' }}>
          <p className="text-xs" style={{ color: 'var(--color-smoke)' }}>
            © 2026 Stren. Built for independent gyms.
          </p>
        </div>
      </div>
    </footer>
  );
}
