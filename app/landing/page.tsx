import { redirect } from 'next/navigation';
import { LandingNav } from '@/components/landing/landing-nav';
import { LandingClientPage } from '@/components/landing/landing-client-page';
import '@/styles/swiper-custom.css';

// Safety net: catch any auth code/token_hash that Supabase drops here instead
// of at /auth/callback (e.g. after the root redirect strips the query string).
export default function LandingPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const sp = searchParams ?? {};
  const code = sp['code'];
  const tokenHash = sp['token_hash'];
  const type = sp['type'];

  if (code || tokenHash) {
    const params = new URLSearchParams(
      Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][],
    );
    if (type === 'recovery' && !params.has('next')) {
      params.set('next', '/reset-password');
    }
    redirect(`/auth/callback?${params.toString()}`);
  }

  return (
    <div style={{ backgroundColor: 'var(--color-background)' }}>
      <LandingNav />
      <LandingClientPage />
    </div>
  );
}
