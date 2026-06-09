import { LandingNav } from '@/components/landing/landing-nav';
import { LandingClientPage } from '@/components/landing/landing-client-page';
import '@/styles/swiper-custom.css';

export default function LandingPage() {
  return (
    <div style={{ backgroundColor: 'var(--color-background)' }}>
      <LandingNav />
      <LandingClientPage />
    </div>
  );
}
