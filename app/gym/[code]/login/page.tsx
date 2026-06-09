import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { getGymPublicByCode } from '@/lib/gym-public';

export const revalidate = 86400;

type PageProps = {
  params: Promise<{ code: string }> | { code: string };
  searchParams?: Promise<{ from?: string }> | { from?: string };
};

export default async function GymLoginPage({ params, searchParams }: PageProps) {
  const { code: rawCode } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { code, data: gym } = await getGymPublicByCode(rawCode);
  const source = resolvedSearchParams?.from;
  const backHref = source === 'select' ? '/gym-select' : `/gym/${encodeURIComponent(code)}`;
  const backLabel = source === 'select' ? 'Back to gym select' : 'Back to gym page';
  const originPath = source ? `/gym/${encodeURIComponent(code)}/login?from=${source}` : `/gym/${encodeURIComponent(code)}/login`

  if (!gym) {
    notFound();
  }

  return (
    <div
      className="min-h-dvh md:min-h-screen flex flex-col md:items-center md:justify-center px-6 py-8 md:p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, var(--color-secondary) 0%, var(--color-primary-dark) 55%, var(--color-primary) 100%)',
      }}
    >
      <div className="w-full max-w-md relative z-10 md:rounded-3xl md:p-10">
        <div
          className="absolute inset-0 hidden md:block rounded-3xl"
          style={{
            backgroundColor: 'rgba(255,255,255,0.1)',
            boxShadow: '0 4px 40px rgba(0, 0, 0, 0.18), 0 1px 3px rgba(0, 0, 0, 0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
          }}
        />

        <div className="relative z-10">
        <div className="mb-4 md:mb-2">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: 'rgba(255,255,255,0.85)' }}
          >
            &larr; {backLabel}
          </Link>
        </div>
        <div className="flex justify-center pt-14 md:pt-0 mb-10 md:mb-8">
          <Link href={`/gym/${encodeURIComponent(code)}`}>
            <div
              className="h-20 w-20 rounded-full overflow-hidden border-2 cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'var(--color-white)' }}
            >
              {gym.logo_url ? (
                <Image src={gym.logo_url} alt={`${gym.name} logo`} width={80} height={80} className="h-full w-full object-cover" />
              ) : (
                <Image src="/stren-logo.png" alt="Stren Logo" width={80} height={80} className="h-full w-full object-contain p-1" />
              )}
            </div>
          </Link>
        </div>

        <div
          className="p-5 md:p-8 rounded-2xl border shadow-2xl"
          style={{
            backgroundColor: 'rgba(255,255,255,0.96)',
            borderColor: 'rgba(255,255,255,0.45)',
            borderWidth: '1px',
          }}
        >
          <div className="mb-8">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.25em]"
              style={{ color: 'var(--color-secondary)' }}
            >
              Gym Access
            </p>
            <h1
              className="text-4xl font-bold mb-2"
              style={{
                color: 'var(--color-secondary)',
                fontFamily: 'var(--font-heading)',
                fontWeight: 800,
              }}
            >
              {gym.name}
            </h1>
            <p className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>
              Sign in to your gym account
            </p>
          </div>

          <LoginForm gymCode={code} initialOriginPath={originPath} />
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.85)' }}>
          Stren © 2026. All rights reserved.
        </p>
        </div>
      </div>
    </div>
  );
}
