import { redirect } from 'next/navigation';

// Safety net: if Supabase drops an auth code or token_hash on the Site URL
// (e.g. when redirect_to allowlist matching strips query params), forward it
// to /auth/callback so the session exchange still works.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const resolvedSearchParams = await searchParams;
  const code = resolvedSearchParams['code'];
  const tokenHash = resolvedSearchParams['token_hash'];
  const type = resolvedSearchParams['type'];

  if (code || tokenHash) {
    const params = new URLSearchParams(
      Object.entries(resolvedSearchParams).filter(([, v]) => v !== undefined) as [string, string][],
    );
    // Recovery tokens should land on the reset-password form, not the normal post-login route.
    if (type === 'recovery' && !params.has('next')) {
      params.set('next', '/reset-password');
    }
    redirect(`/auth/callback?${params.toString()}`);
  }

  redirect('/landing');
}
