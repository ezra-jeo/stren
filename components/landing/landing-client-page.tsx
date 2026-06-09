'use client';

import dynamic from 'next/dynamic';
import { LandingHero } from '@/components/landing/landing-hero';
import { Skeleton } from '@/components/ui/skeleton';

// Lazy load sections that are below the fold
const AboutSection = dynamic(() => import('@/components/landing/about-section').then(mod => mod.AboutSection), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

const FeatureAccordion = dynamic(() => import('@/components/landing/feature-accordion').then(mod => mod.FeatureAccordion), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

const CTAOverlay = dynamic(() => import('@/components/landing/cta-overlay').then(mod => mod.CTAOverlay), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

const GymFinderSection = dynamic(() => import('@/components/gym-finder-section').then(mod => mod.GymFinderSection), {
  loading: () => <Skeleton className="h-screen w-full" />,
});

const ContactFooter = dynamic(() => import('@/components/landing/contact-footer').then(mod => mod.ContactFooter), {
  loading: () => <Skeleton className="h-24 w-full" />,
});

// Lazy load Swiper to reduce initial bundle
const FullPageSwiper = dynamic(
  () => import('@/components/landing/full-page-swiper').then(mod => ({ default: mod.FullPageSwiper })),
  { 
    ssr: false,
    loading: () => (
      <div className="h-screen">
        <LandingHero />
      </div>
    ),
  }
);

export function LandingClientPage() {
  return (
    <FullPageSwiper>
      {/* Slide 1: Hero */}
      <div className="hero-wrapper">
        <LandingHero />
      </div>

      {/* Slide 2: About */}
      <div className="content-visibility-auto">
        <AboutSection />
      </div>

      {/* Slide 3: Features */}
      <div className="content-visibility-auto">
        <FeatureAccordion />
      </div>

      {/* Slide 4: CTA */}
      <div className="content-visibility-auto">
        <CTAOverlay />
      </div>

      {/* Slide 5: Gym Finder + Footer */}
      <div className="h-screen flex flex-col content-visibility-auto">
        <div className="flex-1">
          <GymFinderSection />
        </div>
        <ContactFooter />
      </div>
    </FullPageSwiper>
  );
}
