import Image from 'next/image';

export function AboutSection() {
  return (
    <section
      id="about"
      className="min-h-screen lg:h-screen flex items-center px-6 lg:px-16"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <div className="max-w-7xl mx-auto w-full py-20 lg:py-0">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left: Text Content */}
          <div className="relative order-2 lg:order-1">
            <span
              className="absolute -top-6 -left-4 select-none pointer-events-none leading-none hidden lg:block"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '10rem',
                color: 'hsl(var(--quote-mark-bg))',
              }}
              aria-hidden="true"
            >
              &ldquo;
            </span>

            <p
              className="text-sm font-semibold uppercase tracking-[0.15em] mb-4"
              style={{ color: 'var(--color-primary)', fontSize: 'var(--type-label)' }}
            >
              Why We Built Stren
            </p>

            <h2
              className="font-bold mb-6 leading-tight"
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                color: 'var(--color-text-primary)',
              }}
            >
              Software made for independent gyms
            </h2>

            <div
              className="space-y-4 leading-relaxed"
              style={{ fontSize: 'var(--type-body)', color: 'var(--color-text-secondary)' }}
            >
              <p>
                We watched gym owners in the Philippines track memberships in notebooks,
                chase payments through group chats, and lose count of who actually showed up.
              </p>
              <p>
                Stren is the system we wish existed - simple enough to learn in minutes,
                powerful enough to run your entire gym. No contracts, no complicated setup,
                no enterprise pricing.
              </p>
              <p style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                Just the tools you need to focus on what you do best: your members.
              </p>
            </div>

            <p
              className="mt-6 text-sm font-semibold tracking-wide"
              style={{ color: 'var(--color-text-muted)' }}
            >
              &mdash; The Stren Team
            </p>
          </div>

          {/* Right: Image */}
          <div className="relative order-1 lg:order-2">
            <div 
              className="relative aspect-[4/3] lg:aspect-[3/4] rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}
            >
              <Image
                src="/YourGym.webp"
                alt="Gym owner managing their business"
                fill
                className="object-cover"
                loading="lazy"
              />
              {/* Warm overlay */}
              <div 
                className="absolute inset-0"
                style={{ 
                  background: 'linear-gradient(135deg, rgba(212,149,106,0.1) 0%, transparent 50%)',
                }}
              />
            </div>
            
            {/* Decorative element */}
            <div 
              className="absolute -bottom-4 -left-4 w-24 h-24 rounded-xl hidden lg:block"
              style={{ backgroundColor: 'var(--color-primary-glow)' }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
