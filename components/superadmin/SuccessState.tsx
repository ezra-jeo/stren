'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Copy, AlertTriangle } from 'lucide-react';
import { A, ACard, PrimaryBtn, GhostBtn } from '@/lib/admin-ui';

export interface ProvisionResult {
  gymId: string;
  gymName: string;
  gymCode: string;
  ownerEmail: string;
  expiresAt: string;
  claimLink: string;
  emailDelivered: boolean;
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    toast.success('Claim link copied');
  } catch {
    toast.error('Failed to copy link');
  }
}

export function SuccessState({ result, onReturn }: { result: ProvisionResult; onReturn: () => void }) {
  const [claimLink, setClaimLink] = useState(result.claimLink);
  const [expiresAt, setExpiresAt] = useState(result.expiresAt);
  const [emailDelivered, setEmailDelivered] = useState(result.emailDelivered);
  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (resending) return;
    setResending(true);
    try {
      const response = await fetch('/api/superadmin/onboarding/resend-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymId: result.gymId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Failed to resend invitation.');
      setClaimLink(data.claimLink);
      setExpiresAt(data.expiresAt);
      setEmailDelivered(Boolean(data.emailDelivered));
      toast.success(data.emailDelivered ? 'Invitation resent.' : 'Gym updated, but the invitation email failed to send again.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend invitation.');
    } finally {
      setResending(false);
    }
  }

  const expiryLabel = new Date(expiresAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="onboarding-step-enter max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="onboarding-check-pop h-6 w-6" style={{ color: 'hsl(var(--admin-active-text))' }} />
        <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: A.text }}>
          {result.gymName} is ready
        </h1>
      </div>

      <ACard className="p-5 space-y-4">
        <div>
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ backgroundColor: 'hsl(38 92% 95%)', color: 'hsl(38 92% 35%)' }}
          >
            Pending owner claim
          </span>
        </div>

        <div>
          <p className="text-xs font-medium" style={{ color: A.muted }}>Sent to</p>
          <p className="text-sm" style={{ color: A.text }}>{result.ownerEmail}</p>
        </div>

        <div>
          <p className="text-xs font-medium" style={{ color: A.muted }}>Claim link expires</p>
          <p className="text-sm" style={{ color: A.text }}>{expiryLabel}</p>
        </div>

        {!emailDelivered && (
          <div className="flex items-start gap-2 rounded-lg p-3" style={{ backgroundColor: 'hsl(0 84% 97%)' }}>
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: A.danger }} />
            <p className="text-xs" style={{ color: A.danger }}>
              The gym was created, but the invitation email failed to send. Copy the claim link below or resend the invitation.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <GhostBtn onClick={() => void copyToClipboard(claimLink)}>
            <Copy className="h-3.5 w-3.5" /> Copy claim link
          </GhostBtn>
          <GhostBtn onClick={() => void handleResend()} disabled={resending}>
            {resending ? 'Resending…' : 'Resend invitation'}
          </GhostBtn>
        </div>
      </ACard>

      <div className="flex justify-end">
        <PrimaryBtn onClick={onReturn}>Return to Assisted Onboarding</PrimaryBtn>
      </div>
    </div>
  );
}
