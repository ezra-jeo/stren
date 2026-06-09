'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Feature {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  details: {
    heading: string;
    text: string;
  }[];
}

const features: Feature[] = [
  {
    id: 'checkin',
    title: 'Effortless Check-In',
    subtitle: 'QR Scanning',
    description: 'Members scan in seconds. You see attendance in real-time.',
    image: '/checkin.webp',
    details: [
      {
        heading: 'Instant QR Scan',
        text: 'Each member gets a unique QR code. Front desk scans it — done in under 2 seconds.',
      },
      {
        heading: 'Live Headcount',
        text: 'See exactly how many members are in your gym right now, from anywhere.',
      },
      {
        heading: 'Attendance History',
        text: 'Every check-in is logged automatically. Track patterns and peak hours.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payment Clarity',
    subtitle: 'Never Chase Dues Again',
    description: 'Know exactly who has paid, who is overdue, and your revenue at a glance.',
    image: '/strendashboard.webp',
    details: [
      {
        heading: 'Overdue Alerts',
        text: 'Instantly see which members have unpaid balances with automatic flagging.',
      },
      {
        heading: 'Revenue Dashboard',
        text: 'Your monthly and yearly earnings visualized. No spreadsheets needed.',
      },
      {
        heading: 'Payment History',
        text: 'Full transaction record per member. Export anytime for your records.',
      },
    ],
  },
  {
    id: 'members',
    title: 'Member Profiles',
    subtitle: 'Everything in One Place',
    description: 'Plans, payments, attendance — one profile tells the whole story.',
    image: '/landingmembers.webp',
    details: [
      {
        heading: 'Complete Overview',
        text: 'Membership plan, payment status, visit history — all on one screen.',
      },
      {
        heading: 'Instant Search',
        text: 'Find any member in seconds. Search by name, email, or membership ID.',
      },
      {
        heading: 'Quick Actions',
        text: 'Renew plans, record payments, or update info with just a few clicks.',
      },
    ],
  },
];

export function FeatureAccordion() {
  const [expandedId, setExpandedId] = useState<string>(features[0].id);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleExpand = (id: string) => {
    setExpandedId(expandedId === id ? '' : id);
  };

  // Mobile layout: vertical stacked cards
  if (isMobile) {
    return (
      <section
        id="features"
        className="min-h-screen py-20 px-5"
        style={{ backgroundColor: 'var(--color-white)' }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p
              className="text-sm font-semibold uppercase tracking-[0.15em] mb-3"
              style={{ color: 'var(--color-primary)' }}
            >
              What Stren Does
            </p>
            <h2
              className="text-3xl font-bold leading-tight"
              style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--color-text-primary)',
              }}
            >
              Built for gym owners
            </h2>
          </div>

          <div className="space-y-4">
            {features.map((feature) => {
              const isExpanded = expandedId === feature.id;
              return (
                <div
                  key={feature.id}
                  className="rounded-xl overflow-hidden transition-all duration-500"
                  style={{
                    boxShadow: isExpanded
                      ? '0 8px 32px rgba(0,0,0,0.12)'
                      : '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleExpand(feature.id)}
                    className="w-full relative h-48 overflow-hidden"
                  >
                    <Image
                      src={feature.image}
                      alt={feature.title}
                      fill
                      className="object-cover"
                      loading="eager"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background: isExpanded
                          ? 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 100%)'
                          : 'rgba(0,0,0,0.5)',
                      }}
                    />
                    <div className="absolute inset-0 flex flex-col justify-end p-5 text-left">
                      <p
                        className="text-xs font-medium uppercase tracking-wider mb-1"
                        style={{ color: 'var(--color-primary-light)' }}
                      >
                        {feature.subtitle}
                      </p>
                      <h3 className="text-xl font-bold text-white">
                        {feature.title}
                      </h3>
                    </div>
                  </button>

                  <div
                    className="overflow-hidden transition-all duration-500"
                    style={{
                      maxHeight: isExpanded ? '600px' : '0',
                      opacity: isExpanded ? 1 : 0,
                    }}
                  >
                    <div className="p-5 bg-white">
                      <p
                        className="mb-5 leading-relaxed"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {feature.description}
                      </p>
                      <div className="space-y-4">
                        {feature.details.map((detail, idx) => (
                          <div key={idx}>
                            <h4
                              className="font-semibold mb-1"
                              style={{ color: 'var(--color-text-primary)' }}
                            >
                              {detail.heading}
                            </h4>
                            <p
                              className="text-sm leading-relaxed"
                              style={{ color: 'var(--color-text-secondary)' }}
                            >
                              {detail.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  // Desktop layout: horizontal accordion
  return (
    <section
      id="features"
      className="h-screen flex flex-col justify-center px-8 lg:px-16"
      style={{ backgroundColor: 'var(--color-white)' }}
    >
      <div className="max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <p
            className="text-sm font-semibold uppercase tracking-[0.15em] mb-3"
            style={{ color: 'var(--color-primary)' }}
          >
            What Stren Does
          </p>
          <h2
            className="text-4xl lg:text-5xl font-bold leading-tight"
            style={{
              fontFamily: 'var(--font-heading)',
              color: 'var(--color-text-primary)',
            }}
          >
            Built for gym owners
          </h2>
        </div>

        <div className="flex gap-4 h-[500px]">
          {features.map((feature) => {
            const isExpanded = expandedId === feature.id;
            return (
              <div
                key={feature.id}
                className="relative rounded-xl overflow-hidden cursor-pointer transition-all duration-500 ease-out"
                style={{
                  flex: isExpanded ? '1 1 70%' : '1 1 15%',
                  minWidth: isExpanded ? '60%' : '12%',
                }}
                onMouseEnter={() => setExpandedId(feature.id)}
                onClick={() => setExpandedId(feature.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setExpandedId(feature.id);
                  }
                }}
                aria-expanded={isExpanded}
              >
                <Image
                  src={feature.image}
                  alt={feature.title}
                  fill
                  className="object-cover transition-transform duration-700"
                  style={{
                    transform: isExpanded ? 'scale(1.05)' : 'scale(1)',
                  }}
                  loading="lazy"
                />

                {/* Overlay */}
                <div
                  className="absolute inset-0 transition-all duration-500"
                  style={{
                    background: isExpanded
                      ? 'linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%)'
                      : 'rgba(0,0,0,0.6)',
                  }}
                />

                {/* Collapsed state: vertical title */}
                <div
                  className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
                  style={{ opacity: isExpanded ? 0 : 1 }}
                >
                  <h3
                    className="text-white text-lg font-semibold whitespace-nowrap"
                    style={{
                      writingMode: 'vertical-rl',
                      textOrientation: 'mixed',
                      transform: 'rotate(180deg)',
                    }}
                  >
                    {feature.title}
                  </h3>
                </div>

                {/* Expanded state: full content */}
                <div
                  className="absolute inset-0 flex transition-opacity duration-500"
                  style={{
                    opacity: isExpanded ? 1 : 0,
                    pointerEvents: isExpanded ? 'auto' : 'none',
                  }}
                >
                  {/* Left content area */}
                  <div className="w-1/2 p-8 flex flex-col justify-end">
                    <p
                      className="text-xs font-semibold uppercase tracking-widest mb-2"
                      style={{ color: 'var(--color-primary-light)' }}
                    >
                      {feature.subtitle}
                    </p>
                    <h3
                      className="text-3xl font-bold text-white mb-3"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {feature.title}
                    </h3>
                    <p className="text-white/80 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  {/* Right detail cards */}
                  <div className="w-1/2 p-6 flex flex-col justify-center gap-3">
                    {feature.details.map((detail, idx) => (
                      <div
                        key={idx}
                        className="bg-white/95 backdrop-blur-sm rounded-lg p-4 shadow-lg transition-transform duration-300 hover:scale-[1.02]"
                      >
                        <h4
                          className="font-semibold mb-1 text-sm"
                          style={{ color: 'var(--color-text-primary)' }}
                        >
                          {detail.heading}
                        </h4>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: 'var(--color-text-secondary)' }}
                        >
                          {detail.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination indicators */}
        <div className="flex gap-3 mt-6">
          {features.map((feature) => (
            <button
              key={feature.id}
              type="button"
              onClick={() => setExpandedId(feature.id)}
              className="flex-1 h-1 rounded-full transition-all duration-300"
              style={{
                backgroundColor:
                  expandedId === feature.id
                    ? 'var(--color-primary)'
                    : 'var(--color-surface)',
              }}
              aria-label={`View ${feature.title}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
