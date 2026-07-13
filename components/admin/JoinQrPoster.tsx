'use client';

/**
 * Printable join-QR poster (grill amendment 2026-07-11; §2.5 path 4, §5 U2).
 *
 * An owner prints this and pins it at the front desk. The QR encodes the plain
 * `/auth?mode=signup&gym=CODE` URL — phone cameras open it natively,
 * landing a new member on account creation pre-flavored for this gym, which drops them
 * into **membership verification** after they create their account.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Download } from 'lucide-react';
import { GymAvatar } from '@/components/gyms/gym-badges';

/** The relative join link the QR points at (also shown as readable text). */
export function joinSignupPath(code: string): string {
  return `/auth?mode=signup&gym=${encodeURIComponent(code)}`;
}

export function JoinQrPoster({
  gymName,
  gymCode,
  logoUrl = null,
}: {
  gymName: string;
  gymCode: string;
  logoUrl?: string | null;
}) {
  const path = joinSignupPath(gymCode);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [absoluteUrl, setAbsoluteUrl] = useState<string>(path);

  useEffect(() => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
    setAbsoluteUrl(url);
    let active = true;
    void QRCode.toDataURL(url, { margin: 1, width: 512, errorCorrectionLevel: 'M' }).then((dataUrl) => {
      if (active) setQrDataUrl(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [path]);

  function download() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${gymCode}-join-qr.png`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)' }}
        >
          <Printer size={16} /> Print poster
        </button>
        <button
          type="button"
          onClick={download}
          disabled={!qrDataUrl}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
        >
          <Download size={16} /> Download QR
        </button>
      </div>

      {/* The poster itself — centered, print-friendly. */}
      <div
        className="mx-auto max-w-sm rounded-2xl border p-8 text-center"
        style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
      >
        <div className="flex items-center justify-center gap-2">
          <GymAvatar name={gymName} logoUrl={logoUrl} size={36} />
          <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}>
            {gymName}
          </p>
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-widest" style={{ color: 'var(--color-primary)' }}>
          Scan to join
        </p>

        <div className="mt-4 flex justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR code to verify membership with ${gymName}`} width={220} height={220} className="rounded-lg" />
          ) : (
            <div
              className="flex h-[220px] w-[220px] items-center justify-center rounded-lg text-sm"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}
            >
              Preparing QR…
            </div>
          )}
        </div>

        <p className="mt-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Point your phone camera at the code, or go to
        </p>
        <p className="mt-1 break-all text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }} data-testid="join-url">
          {absoluteUrl}
        </p>
      </div>
    </div>
  );
}
