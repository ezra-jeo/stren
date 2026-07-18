'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { GymAvatar } from '@/components/gyms/gym-badges';
import { A } from '@/lib/admin-ui';
import type { PreviewData } from '@/lib/onboarding/preview';

export function QrPosterPreview({ data }: { data: PreviewData }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data.inviteQrEnabled) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    const path = `/auth?mode=signup&gym=${encodeURIComponent(data.slug)}`;
    void QRCode.toDataURL(path, { margin: 1, width: 160, errorCorrectionLevel: 'M' }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [data.slug, data.inviteQrEnabled]);

  if (!data.inviteQrEnabled) {
    return (
      <div className="rounded-xl p-4 text-center" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
        <p className="text-xs" style={{ color: A.muted }}>Invite QR generation is turned off for this gym.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}>
      <div className="flex items-center justify-center gap-2 mb-2">
        <GymAvatar name={data.gymName} logoUrl={data.logoUrl} size={20} />
        <p className="text-xs font-semibold truncate" style={{ color: A.text }}>{data.gymName}</p>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: A.primary }}>Scan to join</p>
      <div className="flex justify-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`Join QR preview for ${data.gymName}`} width={120} height={120} className="rounded-md" />
        ) : (
          <div className="flex h-[120px] w-[120px] items-center justify-center rounded-md text-[10px]" style={{ backgroundColor: A.bg, color: A.muted }}>
            Preparing…
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] break-all" style={{ color: A.muted }}>/gym/{data.slug}</p>
    </div>
  );
}
