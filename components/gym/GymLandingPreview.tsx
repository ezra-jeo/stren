import Image from 'next/image';
import Link from 'next/link';
import { MapPin, Phone, Facebook, Instagram, Globe, Check, EyeOff } from 'lucide-react';

/**
 * Prop-driven public gym page body (ImplementationPlan.md §7.1).
 *
 * Extracted from the inline `GymLandingPage` so the public pages AND the Gym Page
 * Studio preview render the same output. The public pages render it with
 * `interactive` true and no forced device (responsive markup preserved verbatim —
 * pixel-identical to before this refactor). The Studio forces a device, sets
 * `interactive={false}` (links render but never navigate), and can inject the
 * focal-point editor over the hero. The component itself stays dumb — feature
 * gating is expressed through the `showTeam` / `pageHidden` props by the caller.
 */

export type GymPreviewData = {
  name: string;
  code: string;
  tagline: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  brandColor: string;
  secondaryColor: string | null;
  operatingHours: Record<string, string> | null;
  amenities: string[] | null;
  socialLinks: { facebook?: string; instagram?: string; website?: string } | null;
  teamMembers: { name: string; role: string; bio?: string; photo_url?: string }[] | null;
  pricingPackages: { name: string; price: string; duration: string; features: string[]; is_featured: boolean }[] | null;
  mapEmbedUrl: string | null;
  directions: string | null;
  memberCount: number;
  coverFocal: { x: number; y: number };                          // 0–100
  sectionVisibility: { amenities: boolean; hours: boolean; contact: boolean };
};

export type GymPreviewView = 'home' | 'join' | 'contact' | 'pricing' | 'locate';

type GymLandingPreviewProps = {
  gym: GymPreviewData;
  view: GymPreviewView;
  /** Omit for responsive public output; set to force one device branch in the Studio. */
  device?: 'desktop' | 'mobile';
  /** true: real links. false (Studio): links render but do not navigate. */
  interactive?: boolean;
  /** Studio injects the FocalPointEditor here (home/join heroes only). */
  focalOverlay?: React.ReactNode;
  /** Contact-page team block visibility (mirrors the `public_team` feature). */
  showTeam?: boolean;
  /** Render the §7.8 hidden-page placeholder instead of the body (Studio, feature off). */
  pageHidden?: boolean;
};

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function PreviewLink({
  interactive,
  href,
  className,
  style,
  target,
  rel,
  children,
}: {
  interactive: boolean;
  href: string;
  className?: string;
  style?: React.CSSProperties;
  target?: string;
  rel?: string;
  children: React.ReactNode;
}) {
  if (interactive) {
    return (
      <Link href={href} className={className} style={style} target={target} rel={rel}>
        {children}
      </Link>
    );
  }
  return (
    <a className={className} style={style} role="link" aria-disabled="true" onClick={(e) => e.preventDefault()}>
      {children}
    </a>
  );
}

export function GymLandingPreview({
  gym,
  view,
  device,
  interactive = true,
  focalOverlay,
  showTeam = true,
  pageHidden = false,
}: GymLandingPreviewProps) {
  if (pageHidden) {
    return <HiddenPagePlaceholder view={view} />;
  }
  switch (view) {
    case 'home':
      return <HomeBody gym={gym} device={device} interactive={interactive} focalOverlay={focalOverlay} />;
    case 'join':
      return <JoinBody gym={gym} interactive={interactive} focalOverlay={focalOverlay} />;
    case 'contact':
      return <ContactBody gym={gym} interactive={interactive} showTeam={showTeam} />;
    case 'pricing':
      return <PricingBody gym={gym} interactive={interactive} />;
    case 'locate':
      return <LocateBody gym={gym} />;
    default:
      return null;
  }
}

// ── HOME ─────────────────────────────────────────────────────────────────────

function HomeBody({
  gym,
  device,
  interactive,
  focalOverlay,
}: {
  gym: GymPreviewData;
  device?: 'desktop' | 'mobile';
  interactive: boolean;
  focalOverlay?: React.ReactNode;
}) {
  const hasAmenities = !!gym.amenities && gym.amenities.length > 0;
  const hasSocial =
    !!gym.socialLinks && (!!gym.socialLinks.facebook || !!gym.socialLinks.instagram || !!gym.socialLinks.website);
  const hasContact = !!gym.address || !!gym.phone;
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
  const objectPosition = `${gym.coverFocal.x}% ${gym.coverFocal.y}%`;
  const sections = gym.sectionVisibility;

  const showMobile = device === undefined || device === 'mobile';
  const showDesktop = device === undefined || device === 'desktop';
  const mobileWrapClass =
    device === 'mobile'
      ? 'relative flex flex-col min-h-screen overflow-hidden'
      : 'relative flex flex-col min-h-screen md:hidden overflow-hidden';
  const desktopWrapClass = device === 'desktop' ? 'block' : 'hidden md:block';

  return (
    <>
      {showMobile && (
        <div className={mobileWrapClass}>
          {gym.coverUrl ? (
            <>
              <Image
                src={gym.coverUrl}
                alt={gym.name}
                fill
                className="object-cover"
                style={{ objectPosition }}
                sizes="100vw"
                priority
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.75) 75%, rgba(0,0,0,0.92) 100%)',
                }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(145deg, var(--color-secondary), var(--color-primary-dark), var(--color-primary))' }}
            />
          )}

          {focalOverlay}

          <div className="relative z-10 flex justify-center pt-14">
            {gym.logoUrl ? (
              <div className="h-16 w-16 overflow-hidden rounded-2xl border-2 border-white/70 shadow-lg">
                <Image src={gym.logoUrl} alt={`${gym.name} logo`} width={64} height={64} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)' }}>
                <span className="text-white text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {gym.name.charAt(0)}
                </span>
              </div>
            )}
          </div>

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/85" style={{ fontFamily: 'var(--font-heading)' }}>
              Personal Training
            </p>
            <h1 className="mt-2 text-4xl font-bold text-white leading-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              {gym.name}
            </h1>
            {gym.tagline && <p className="mt-3 text-base text-white/80 max-w-xs leading-relaxed">{gym.tagline}</p>}
          </div>

          <div className="relative z-10 px-6 pb-12 space-y-3">
            <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/signup`} className="block">
              <button
                className="w-full py-4 rounded-xl text-base font-semibold uppercase tracking-[0.14em]"
                style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
              >
                Create Account
              </button>
            </PreviewLink>
            <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/login?from=landing`} className="block">
              <button
                className="w-full py-4 rounded-xl border text-base font-semibold uppercase tracking-[0.14em]"
                style={{ backgroundColor: 'rgba(0,0,0,0.28)', color: 'var(--color-white)', borderColor: 'rgba(255,255,255,0.3)' }}
              >
                Log In
              </button>
            </PreviewLink>
            <div className="pt-1 text-center">
              <PreviewLink interactive={interactive} href="/landing" className="text-xs font-medium underline-offset-4 hover:underline" style={{ color: 'rgba(255,255,255,0.72)' }}>
                Back to Stren
              </PreviewLink>
            </div>
          </div>
        </div>
      )}

      {showDesktop && (
        <div className={desktopWrapClass}>
          <header className="relative min-h-[90vh] overflow-hidden md:min-h-screen">
            {gym.coverUrl ? (
              <>
                <Image src={gym.coverUrl} alt={gym.name} fill className="object-cover" style={{ objectPosition }} sizes="100vw" priority />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.65))' }} />
              </>
            ) : (
              <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }} />
            )}

            {focalOverlay}

            <div className="relative z-10 flex min-h-[90vh] items-end md:min-h-screen">
              <div className="w-full px-5 pb-14 sm:px-6 sm:pb-16 md:px-16 md:pb-24">
                <div className="max-w-4xl">
                  {gym.logoUrl && (
                    <div className="mb-6 h-16 w-16 overflow-hidden rounded-full border" style={{ borderColor: 'rgba(255, 255, 255, 0.85)' }}>
                      <Image src={gym.logoUrl} alt={`${gym.name} logo`} width={64} height={64} className="h-full w-full object-cover" />
                    </div>
                  )}

                  <h1 className="text-4xl font-bold leading-[0.95] tracking-tight sm:text-5xl md:text-7xl" style={{ color: 'var(--color-white)', fontFamily: 'var(--font-heading)' }}>
                    {gym.name}
                  </h1>

                  {gym.tagline && (
                    <p className="mt-3 max-w-xl text-lg sm:text-xl md:text-2xl" style={{ color: 'var(--color-white)', opacity: 0.8 }}>
                      {gym.tagline}
                    </p>
                  )}

                  <div className="mt-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/signup`}>
                        <button
                          className="w-full max-w-[90vw] truncate rounded-xl px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10"
                          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
                        >
                          Join {gym.name}
                        </button>
                      </PreviewLink>
                      <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/login?from=landing`}>
                        <button
                          className="w-full max-w-[90vw] truncate rounded-xl border px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10"
                          style={{ borderColor: 'rgba(255,255,255,0.45)', color: 'var(--color-white)', backgroundColor: 'rgba(0,0,0,0.22)' }}
                        >
                          Login
                        </button>
                      </PreviewLink>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {gym.description && (
            <section style={{ backgroundColor: 'var(--color-white)' }}>
              <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
                <div className="grid gap-10 md:grid-cols-5">
                  <div className="md:col-span-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>About</p>
                    <h2 className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
                      Our Story
                    </h2>
                    <p className="mt-5 text-lg leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{gym.description}</p>
                  </div>

                  {sections.contact && (
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>Contact</p>
                      <div className="mt-5 space-y-4">
                        {gym.address && (
                          <div className="flex items-start gap-3">
                            <MapPin size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{gym.address}</p>
                          </div>
                        )}
                        {gym.phone && (
                          <div className="flex items-start gap-3">
                            <Phone size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{gym.phone}</p>
                          </div>
                        )}
                        {!hasContact && (
                          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Contact details will be available soon.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {hasAmenities && sections.amenities && (
            <section style={{ backgroundColor: 'var(--color-background)' }}>
              <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>What We Offer</p>
                <h2 className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
                  Amenities
                </h2>
                <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {gym.amenities?.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
                      style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
                    >
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: 'var(--color-primary)' }} />
                      <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {gym.operatingHours && sections.hours && (
            <section style={{ backgroundColor: 'var(--color-white)' }}>
              <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>Hours</p>
                <h2 className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
                  Open Every Day for Your Training
                </h2>
                <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-7">
                  {DAY_ORDER.map((day) => {
                    const hours = gym.operatingHours?.[day] || 'Closed';
                    const isClosed = hours === 'Closed';
                    const isToday = day === today;
                    return (
                      <div
                        key={day}
                        className="rounded-2xl border p-5 text-center"
                        style={{ borderColor: isToday ? 'var(--color-primary)' : 'var(--color-surface)', opacity: isClosed ? 0.5 : 1 }}
                      >
                        <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-muted)' }}>{day}</p>
                        <p className="mt-1 text-sm font-semibold" style={{ color: isToday ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>{hours}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {gym.address && sections.contact && (
            <section style={{ backgroundColor: 'var(--color-background)' }}>
              <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>Find Us</p>
                <h2 className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
                  Come Train With Us
                </h2>
                <p className="mt-6 text-lg sm:text-xl" style={{ color: 'var(--color-text-secondary)' }}>{gym.address}</p>
                <PreviewLink
                  interactive={interactive}
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gym.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex text-base font-medium"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Get directions -&gt;
                </PreviewLink>
                <div className="mt-8 h-2 w-16 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              </div>
            </section>
          )}

          {hasSocial && sections.contact && (
            <section style={{ backgroundColor: 'var(--color-white)' }}>
              <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
                <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>Connect</p>
                <h2 className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
                  Stay Connected
                </h2>
                <div className="mt-8 flex flex-wrap gap-3">
                  {gym.socialLinks?.facebook && (
                    <PreviewLink interactive={interactive} href={gym.socialLinks.facebook} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-(--color-surface) bg-white px-6 py-3 text-sm font-medium text-(--color-text-primary) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) sm:w-auto sm:px-8" style={{ borderWidth: '1.5px' }}>
                      <Facebook size={18} /> Facebook
                    </PreviewLink>
                  )}
                  {gym.socialLinks?.instagram && (
                    <PreviewLink interactive={interactive} href={gym.socialLinks.instagram} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-(--color-surface) bg-white px-6 py-3 text-sm font-medium text-(--color-text-primary) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) sm:w-auto sm:px-8" style={{ borderWidth: '1.5px' }}>
                      <Instagram size={18} /> Instagram
                    </PreviewLink>
                  )}
                  {gym.socialLinks?.website && (
                    <PreviewLink interactive={interactive} href={gym.socialLinks.website} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-(--color-surface) bg-white px-6 py-3 text-sm font-medium text-(--color-text-primary) transition-colors hover:border-(--color-primary) hover:text-(--color-primary) sm:w-auto sm:px-8" style={{ borderWidth: '1.5px' }}>
                      <Globe size={18} /> Website
                    </PreviewLink>
                  )}
                </div>
              </div>
            </section>
          )}

          <section style={{ background: 'linear-gradient(130deg, var(--color-secondary), var(--color-primary))' }}>
            <div className="mx-auto max-w-5xl px-6 py-20 text-center md:px-16 md:py-28">
              <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl" style={{ color: 'var(--color-white)', fontFamily: 'var(--font-heading)' }}>
                Ready to start?
              </h2>
              <p className="mt-3 text-lg sm:text-xl" style={{ color: 'var(--color-white)', opacity: 0.8 }}>Join {gym.name} today.</p>
              <div className="mt-10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                  <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/signup`}>
                    <button className="w-full max-w-[90vw] truncate rounded-xl px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}>
                      Join {gym.name}
                    </button>
                  </PreviewLink>
                  <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/login?from=landing`}>
                    <button className="w-full max-w-[90vw] truncate rounded-xl border px-8 py-4 text-base font-semibold uppercase tracking-[0.14em] sm:w-auto sm:max-w-none sm:px-10" style={{ borderColor: 'rgba(255,255,255,0.7)', color: 'var(--color-white)', backgroundColor: 'rgba(0,0,0,0.18)' }}>
                      Login
                    </button>
                  </PreviewLink>
                </div>
                <div className="mt-5 text-center">
                  <PreviewLink interactive={interactive} href="/landing" className="text-sm font-medium underline-offset-4 hover:underline" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    Back to Stren
                  </PreviewLink>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// ── CONTACT ──────────────────────────────────────────────────────────────────

function ContactBody({ gym, interactive, showTeam }: { gym: GymPreviewData; interactive: boolean; showTeam: boolean }) {
  const social = gym.socialLinks;
  const hasSocial = !!social && (!!social.facebook || !!social.instagram || !!social.website);
  const team = gym.teamMembers ?? [];

  return (
    <div>
      <section className="px-6 py-20 md:px-16 md:py-28" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}>
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">Get in touch</p>
          <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl md:text-6xl" style={{ fontFamily: 'var(--font-heading)' }}>Contact Us</h1>
        </div>
      </section>

      <section style={{ backgroundColor: 'var(--color-white)' }}>
        <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-20">
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {gym.phone && (
              <div className="flex items-start gap-4 rounded-2xl border p-6" style={{ borderColor: 'var(--color-surface)' }}>
                <Phone size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Phone</p>
                  <p className="mt-1 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{gym.phone}</p>
                </div>
              </div>
            )}
            {gym.address && (
              <div className="flex items-start gap-4 rounded-2xl border p-6" style={{ borderColor: 'var(--color-surface)' }}>
                <MapPin size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Address</p>
                  <p className="mt-1 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{gym.address}</p>
                </div>
              </div>
            )}
            {hasSocial && (
              <div className="flex flex-col gap-2 rounded-2xl border p-6" style={{ borderColor: 'var(--color-surface)' }}>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>Follow Us</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {social?.facebook && (
                    <PreviewLink interactive={interactive} href={social.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                      <Facebook size={14} /> Facebook
                    </PreviewLink>
                  )}
                  {social?.instagram && (
                    <PreviewLink interactive={interactive} href={social.instagram} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                      <Instagram size={14} /> Instagram
                    </PreviewLink>
                  )}
                  {social?.website && (
                    <PreviewLink interactive={interactive} href={social.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                      <Globe size={14} /> Website
                    </PreviewLink>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {showTeam && team.length > 0 && (
        <section style={{ backgroundColor: 'var(--color-background)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>Our People</p>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl md:text-4xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>Meet the Team</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
              {team.map((member) => (
                <div key={member.name} className="overflow-hidden rounded-2xl border" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
                  {member.photo_url ? (
                    <div className="relative h-56 w-full">
                      <Image src={member.photo_url} alt={member.name} fill className="object-cover object-top" />
                    </div>
                  ) : (
                    <div className="flex h-56 w-full items-center justify-center text-4xl font-bold" style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}>
                      {member.name.charAt(0)}
                    </div>
                  )}
                  <div className="p-5">
                    <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{member.name}</p>
                    <p className="mt-0.5 text-sm" style={{ color: 'var(--color-primary)' }}>{member.role}</p>
                    {member.bio && <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{member.bio}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section style={{ backgroundColor: 'var(--color-primary)' }}>
        <div className="mx-auto max-w-5xl px-6 py-16 text-center md:px-16 md:py-20">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to join?</h2>
          <div className="mt-6">
            <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/signup`}>
              <button className="rounded-full px-8 py-3 text-sm font-semibold" style={{ backgroundColor: 'var(--color-white)', color: 'var(--color-primary)' }}>Join {gym.name}</button>
            </PreviewLink>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── PRICING ──────────────────────────────────────────────────────────────────

function PricingBody({ gym, interactive }: { gym: GymPreviewData; interactive: boolean }) {
  const packages = gym.pricingPackages ?? [];

  return (
    <div>
      <section className="px-6 py-20 md:px-16 md:py-28" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}>
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">Membership options</p>
          <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl md:text-6xl" style={{ fontFamily: 'var(--font-heading)' }}>Pricing</h1>
        </div>
      </section>

      <section style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
          {packages.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((pkg) => (
                <div
                  key={pkg.name}
                  className="relative flex flex-col overflow-hidden rounded-2xl border"
                  style={{
                    backgroundColor: 'var(--color-white)',
                    borderColor: pkg.is_featured ? 'var(--color-primary)' : 'var(--color-surface)',
                    borderWidth: pkg.is_featured ? '2px' : '1px',
                  }}
                >
                  {pkg.is_featured && (
                    <div className="py-1.5 text-center text-xs font-semibold uppercase tracking-widest" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}>
                      Most Popular
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>{pkg.duration}</p>
                    <h3 className="mt-2 text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>{pkg.name}</h3>
                    <p className="mt-3 text-3xl font-extrabold" style={{ color: 'var(--color-primary)' }}>{pkg.price}</p>
                    {pkg.features.length > 0 && (
                      <ul className="mt-6 flex-1 space-y-2.5">
                        {pkg.features.map((f) => (
                          <li key={f} className="flex items-start gap-2.5">
                            <Check size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--color-primary)' }} />
                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-8">
                      <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/signup`}>
                        <button
                          className="w-full rounded-full py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                          style={pkg.is_featured ? { backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' } : { backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
                        >
                          Get Started
                        </button>
                      </PreviewLink>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Pricing details coming soon. Contact us for membership rates.</p>
              <PreviewLink interactive={interactive} href={`/gym/${gym.code}/contact`} className="mt-4 inline-block text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                Contact us →
              </PreviewLink>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ── LOCATE ───────────────────────────────────────────────────────────────────

function LocateBody({ gym }: { gym: GymPreviewData }) {
  return (
    <div>
      <section className="px-6 py-20 md:px-16 md:py-28" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))' }}>
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">Find us</p>
          <h1 className="mt-3 text-4xl font-bold text-white sm:text-5xl md:text-6xl" style={{ fontFamily: 'var(--font-heading)' }}>Locate Us</h1>
          {gym.address && (
            <p className="mt-4 flex items-center gap-2 text-white/80">
              <MapPin size={16} className="shrink-0" />
              {gym.address}
            </p>
          )}
        </div>
      </section>

      {gym.mapEmbedUrl && (
        <section style={{ backgroundColor: 'var(--color-white)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>Map</p>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>We are here</h2>
            <div className="mt-8 overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--color-surface)' }}>
              <iframe src={gym.mapEmbedUrl} width="100%" height="450" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" title={`${gym.name} location map`} />
            </div>
            {gym.address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gym.address)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
                Open in Google Maps →
              </a>
            )}
          </div>
        </section>
      )}

      {gym.directions && (
        <section style={{ backgroundColor: 'var(--color-background)' }}>
          <div className="mx-auto max-w-5xl px-6 py-16 md:px-16 md:py-24">
            <p className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--color-primary)' }}>How to get here</p>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>Landmarks &amp; Directions</h2>
            <div className="mt-6 whitespace-pre-wrap text-base leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{gym.directions}</div>
          </div>
        </section>
      )}

      {!gym.mapEmbedUrl && !gym.directions && gym.address && (
        <section style={{ backgroundColor: 'var(--color-white)' }}>
          <div className="mx-auto max-w-5xl px-6 py-20 text-center md:px-16">
            <MapPin size={32} className="mx-auto mb-4" style={{ color: 'var(--color-primary)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>{gym.address}</p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gym.address)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full border px-6 py-2.5 text-sm font-medium" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
              Open in Google Maps →
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

// ── JOIN (Studio-only facsimile of the signup layout) ────────────────────────

function JoinBody({ gym, interactive, focalOverlay }: { gym: GymPreviewData; interactive: boolean; focalOverlay?: React.ReactNode }) {
  const objectPosition = `${gym.coverFocal.x}% ${gym.coverFocal.y}%`;
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="relative h-56 overflow-hidden md:h-72">
        {gym.coverUrl ? (
          <Image src={gym.coverUrl} alt={gym.name} fill className="object-cover" style={{ objectPosition }} sizes="100vw" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(145deg, var(--color-secondary), var(--color-primary-dark), var(--color-primary))' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(0,0,0,0.6))' }} />
        {focalOverlay}
        <div className="absolute inset-x-0 bottom-0 z-10 p-6">
          <h1 className="text-2xl font-bold text-white md:text-3xl" style={{ fontFamily: 'var(--font-heading)' }}>Join {gym.name}</h1>
          {gym.tagline && <p className="mt-1 text-sm text-white/80">{gym.tagline}</p>}
        </div>
      </div>

      <div className="flex-1" style={{ backgroundColor: 'var(--color-background)' }}>
        <div className="mx-auto max-w-md px-6 py-10">
          <div className="rounded-2xl border p-6" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
            <div className="space-y-4">
              {['Full name', 'Email address', 'Password'].map((label) => (
                <div key={label}>
                  <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
                  <input
                    disabled
                    aria-hidden
                    placeholder={label}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--color-surface)', backgroundColor: 'var(--color-background)', color: 'var(--color-text-muted)' }}
                  />
                </div>
              ))}
              <PreviewLink interactive={interactive} href={`/gym/${encodeURIComponent(gym.code)}/signup`} className="block">
                <button className="w-full rounded-xl py-3 text-sm font-semibold uppercase tracking-[0.14em]" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}>
                  Create account
                </button>
              </PreviewLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Hidden-page placeholder (§7.8) ───────────────────────────────────────────

function HiddenPagePlaceholder({ view }: { view: GymPreviewView }) {
  const name = view === 'pricing' ? 'Pricing' : view === 'locate' ? 'Locate' : 'This page';
  return (
    <div className="flex min-h-[420px] items-center justify-center p-10" style={{ backgroundColor: 'var(--color-background)' }}>
      <div className="max-w-sm rounded-2xl border p-8 text-center" style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--color-surface)' }}>
          <EyeOff size={22} style={{ color: 'var(--color-text-muted)' }} />
        </div>
        <p className="text-base font-semibold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>This page is hidden</p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Visitors won&apos;t see {name} in the menu, and the link won&apos;t work.
        </p>
      </div>
    </div>
  );
}
