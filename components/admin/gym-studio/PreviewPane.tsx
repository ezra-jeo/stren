'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { GymLandingPreview } from '@/components/gym/GymLandingPreview';
import { brandColorVars } from '@/lib/brand-color';
import { isFeatureEnabled } from '@/lib/features';
import { useStudio } from './GymPageStudio';
import { PreviewToolbar } from './PreviewToolbar';
import { DeviceFrame } from './DeviceFrame';
import { FocalPointEditor } from './FocalPointEditor';

/** Parse `brandColorVars` output into an inline style object scoping the gym's brand. */
function brandStyle(primary: string, secondary: string | null): CSSProperties {
  const obj: Record<string, string> = {};
  for (const decl of brandColorVars(primary, secondary).split('\n')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const key = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).replace(/;$/, '').trim();
    if (key.startsWith('--')) obj[key] = value;
  }
  return obj as CSSProperties;
}

/**
 * The live preview body: brand-scoped `GymLandingPreview` fed from unsaved Studio
 * state, with the focal editor over the hero and §7.8 feature feedback.
 */
export function PreviewSurface({ device }: { device: 'desktop' | 'mobile' }) {
  const s = useStudio();
  const flags = s.featureFlags;

  const pageHidden =
    (s.previewTab === 'pricing' && !isFeatureEnabled(flags, 'public_pricing')) ||
    (s.previewTab === 'locate' && !isFeatureEnabled(flags, 'public_location'));
  const showTeam = isFeatureEnabled(flags, 'public_team');

  const focalOverlay =
    s.coverUrl && (s.previewTab === 'home' || s.previewTab === 'join') ? <FocalPointEditor device={device} /> : undefined;

  return (
    <div style={brandStyle(s.previewData.brandColor, s.previewData.secondaryColor)}>
      <GymLandingPreview
        gym={s.previewData}
        view={s.previewTab}
        device={device}
        interactive={false}
        focalOverlay={focalOverlay}
        showTeam={showTeam}
        pageHidden={pageHidden}
      />
    </div>
  );
}

export function PreviewPane() {
  const s = useStudio();
  const [host, setHost] = useState('stren.app');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.host) setHost(window.location.host);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col" style={{ backgroundColor: 'var(--color-surface)' }}>
      <PreviewToolbar />
      <div className="flex flex-1 items-start justify-center overflow-auto p-5">
        <DeviceFrame device={s.previewDevice} host={host} code={s.gymCode}>
          <PreviewSurface device={s.previewDevice} />
        </DeviceFrame>
      </div>
    </div>
  );
}
