import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Confirm secure link | Stren',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

const allowedTypes = new Set(['email', 'invite', 'magiclink', 'recovery', 'signup']);

export default async function AuthEmailConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : '';
  const type = typeof params.type === 'string' && allowedTypes.has(params.type) ? params.type : '';
  const recovery = type === 'recovery';
  const next = recovery ? '/reset-password' : null;

  if (!tokenHash || !type) {
    return (
      <main className="min-h-dvh grid place-items-center bg-(--color-background) px-5 py-10">
        <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: 'var(--color-surface)' }}>
          <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">This secure link is incomplete</h1>
          <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">Request a fresh link and try again.</p>
          <Link href={recovery ? '/reset-password' : '/auth?mode=signin'} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-(--color-primary) px-5 font-semibold text-white">
            {recovery ? 'Request another reset link' : 'Return to sign in'}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-(--color-background) px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8" style={{ borderColor: 'var(--color-surface)' }}>
        <h1 className="font-serif text-3xl font-semibold text-(--color-text-primary)">
          {recovery ? 'Continue your password reset' : 'Open your Stren account'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-(--color-text-secondary)">
          {recovery
            ? 'Confirm below to validate the one-time link and choose a new password.'
            : 'Confirm below to use this one-time sign-in link. You can choose a password after your member account opens.'}
        </p>
        <form action="/auth/callback" method="get" className="mt-6">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          {next && <input type="hidden" name="next" value={next} />}
          <button type="submit" className="min-h-12 w-full rounded-xl bg-(--color-primary) px-5 font-semibold text-white">
            {recovery ? 'Continue password reset' : 'Continue to Stren'}
          </button>
        </form>
        <p className="mt-4 text-xs leading-5 text-(--color-text-muted)">This confirmation protects one-time links from automatic email scanners.</p>
      </section>
    </main>
  );
}
