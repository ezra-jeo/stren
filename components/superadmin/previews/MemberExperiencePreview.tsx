'use client';

import { QrCode as QrIcon, MapPin } from 'lucide-react';
import { GymAvatar } from '@/components/gyms/gym-badges';
import { A } from '@/lib/admin-ui';
import type { PreviewData } from '@/lib/onboarding/preview';

export function MemberExperiencePreview({ data }: { data: PreviewData }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-background, #FBF7F2)', border: `1px solid ${A.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <GymAvatar name={data.gymName} logoUrl={data.logoUrl} size={28} />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: A.text, fontFamily: 'var(--font-display)' }}>{data.gymName}</p>
          <p className="text-[11px] flex items-center gap-1 truncate" style={{ color: A.muted }}>
            <MapPin className="h-3 w-3 shrink-0" />
            {data.location}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg px-2.5 py-2" style={{ backgroundColor: A.surface2 }}>
        <p className="text-xs" style={{ color: A.text2 }}>{data.planSummary}</p>
        {data.kioskEnabled && <QrIcon className="h-4 w-4 shrink-0" style={{ color: A.primary }} aria-label="Kiosk check-in enabled" />}
      </div>
    </div>
  );
}

