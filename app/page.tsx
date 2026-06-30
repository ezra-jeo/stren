import { redirect } from 'next/navigation';

// Safety net: if Supabase drops an auth code or token_hash on the Site URL
// (e.g. when redirect_to allowlist matching strips query params), forward it
// to /auth/callback so the session exchange still works.
export default function Home({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const code = searchParams['code'];
  const tokenHash = searchParams['token_hash'];
  const type = searchParams['type'];

  if (code || tokenHash) {
    const params = new URLSearchParams(
      Object.entries(searchParams).filter(([, v]) => v !== undefined) as [string, string][],
    );
    // Recovery tokens should land on the reset-password form, not the normal post-login route.
    if (type === 'recovery' && !params.has('next')) {
      params.set('next', '/reset-password');
    }
    redirect(`/auth/callback?${params.toString()}`);
  }

  redirect('/landing');
}
