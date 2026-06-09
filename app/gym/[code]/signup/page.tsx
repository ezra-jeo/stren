import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getGymPublicByCode } from '@/lib/gym-public';
import { GymSignUpForm } from '@/components/auth/GymSignUpForm';

export const revalidate = 86400;

type PageProps = {
  params: Promise<{ code: string }> | { code: string };
  searchParams?: Promise<{ from?: string }> | { from?: string };
};

export default async function GymSignUpPage({ params, searchParams }: PageProps) {
  const { code: rawCode } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { code, data: gym } = await getGymPublicByCode(rawCode);
  const source = resolvedSearchParams?.from;
  const backHref = source === 'login'
    ? `/gym/${encodeURIComponent(code)}/login`
    : source === 'select'
      ? '/gym-select'
      : '/landing';
  const backLabel = source === 'login'
    ? 'Back to login'
    : source === 'select'
      ? 'Back to gym select'
      : 'Back to Stren';

  if (!gym) notFound();

  const isPublished = gym.is_published;
  const pageBackground = isPublished
    ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.94))'
    : 'linear-gradient(145deg, var(--color-secondary) 0%, var(--color-primary-dark) 55%, var(--color-primary) 100%)';

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row"
      style={{ background: pageBackground, backgroundColor: isPublished ? 'var(--color-secondary)' : undefined }}
    >
      <div className="relative md:flex-1 h-[38vh] md:h-auto md:min-h-screen overflow-hidden">
        {isPublished && gym.cover_url ? (
          <>
            <Image
              src={gym.cover_url}
              alt={gym.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.32), rgba(0,0,0,0.82))' }}
            />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(145deg, var(--color-secondary), var(--color-primary-dark), var(--color-primary))' }}
          />
        )}

        <div className="relative z-10 flex flex-col justify-end h-full p-6 md:p-12">
          <div className="mb-4">
            <Link
              href="/landing"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/90 transition-colors hover:bg-white/15"
            >
              &larr; Back to Stren
            </Link>
          </div>
          {gym.logo_url && (
            <Link href={`/gym/${encodeURIComponent(code)}`} className="mb-4 h-14 w-14 md:h-20 md:w-20 overflow-hidden rounded-full border-2 border-white/80 block hover:opacity-80 transition-opacity">
              <Image
                src={gym.logo_url}
                alt={`${gym.name} logo`}
                width={80}
                height={80}
                className="h-full w-full object-cover"
              />
            </Link>
          )}
          <h1
            className="text-3xl md:text-5xl font-bold leading-tight text-white"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {gym.name}
          </h1>
          {gym.tagline && (
            <p className="mt-2 text-sm md:text-lg text-white/80 max-w-sm leading-relaxed">
              {gym.tagline}
            </p>
          )}
          <span
            className="mt-3 inline-flex self-start rounded-full px-3 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            {gym.member_count} active members
          </span>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center p-6 md:p-12"
        style={{ background: isPublished ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,255,255,0.94))' : 'var(--color-background)' }}
      >
        <div className="w-full max-w-md">
          <div className="mb-8">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              &larr; {backLabel}
            </Link>
          </div>

          <div className="mb-8">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.24em]"
              style={{ color: 'var(--color-secondary)' }}
            >
              {isPublished ? 'New Member' : 'Join the Gym'}
            </p>
            <h2
              className="text-3xl font-bold"
              style={{ color: 'var(--color-secondary)', fontFamily: 'var(--font-heading)', fontWeight: 800 }}
            >
              Join {gym.name}
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {isPublished
                ? 'Create your member account and start using your gym access right away.'
                : 'This gym has not published its public page yet, but you can still create your member account.'}
            </p>
          </div>

          <div className="md:hidden flex justify-center mb-6">
            {gym.logo_url ? (
              <Link href={`/gym/${encodeURIComponent(code)}`} className="rounded-full overflow-hidden block hover:opacity-80 transition-opacity">
                <Image src={gym.logo_url} alt={`${gym.name} logo`} width={64} height={64} className="rounded-full object-cover" />
              </Link>
            ) : (
              <Link href={`/gym/${encodeURIComponent(code)}`} className="block hover:opacity-80 transition-opacity">
                <Image src="/stren-logo.png" alt="Stren Logo" width={64} height={64} className="object-contain" />
              </Link>
            )}
          </div>

          <GymSignUpForm gymCode={code} gymId={gym.id} />

          <p className="mt-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Already have an account?{' '}
            <Link
              href={`/gym/${encodeURIComponent(code)}/login`}
              className="font-semibold"
              style={{ color: 'var(--color-primary)' }}
            >
              Log in
            </Link>
          </p>

          <p className="text-center text-xs mt-6" style={{ color: 'var(--color-text-muted)' }}>
            Stren Copyright 2026. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
