'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { A, PrimaryBtn, GhostBtn } from '@/lib/admin-ui';
import { useWizard, type WizardStep } from '@/lib/onboarding/state';
import { serializeOperatingHours } from '@/lib/onboarding/schemas';

interface ReviewRow {
  step: WizardStep;
  title: string;
  lines: string[];
  status: 'complete' | 'optional-skipped';
}

function buildReviewRows(draft: ReturnType<typeof useWizard>['state']['draft']): ReviewRow[] {
  const activePlan = draft.plans.find((p) => p.isActive) ?? draft.plans[0];
  const hours = serializeOperatingHours(draft.operatingHours);
  const openDays = Object.entries(hours).filter(([, v]) => v !== 'Closed');
  const hoursSummary = openDays.length === 7 && new Set(Object.values(hours)).size === 1
    ? `Every day, ${openDays[0][1]}`
    : `${openDays.length} day${openDays.length === 1 ? '' : 's'} open`;

  return [
    {
      step: 'gym', title: 'Gym', status: 'complete',
      lines: [draft.gym.gymName || 'Untitled gym', draft.gym.address || 'No location set', `stren.app/gym/${draft.gym.slug || 'gym-name'}`],
    },
    {
      step: 'ownerStaff', title: 'Owner & Staff', status: 'complete',
      lines: [draft.owner.name || 'Owner not named', draft.owner.role === 'owner' ? 'Owner' : 'Manager', `${draft.staff.length} staff member${draft.staff.length === 1 ? '' : 's'}`],
    },
    {
      step: 'planAccess', title: 'Membership plans', status: 'complete',
      lines: [`${draft.plans.length} plan${draft.plans.length === 1 ? '' : 's'}`, activePlan ? `${activePlan.name} · ₱${activePlan.price.toLocaleString()}` : 'No plan'],
    },
    { step: 'planAccess', title: 'Operating hours', status: 'complete', lines: [hoursSummary] },
    {
      step: 'planAccess', title: 'Access setup', status: 'complete',
      lines: [
        `Kiosk check-in: ${draft.switches.kioskCheckin ? 'On' : 'Off'}`,
        `Invite QR: ${draft.switches.generateInviteQr ? 'On' : 'Off'}`,
        `Requires active membership: ${draft.switches.checkinRequiresMembership ? 'Yes' : 'No'}`,
        `Visibility: ${draft.switches.visibility === 'public' ? 'Public' : 'Private'}`,
      ],
    },
    {
      step: 'planAccess', title: 'Member import', status: draft.importedMembers.length > 0 ? 'complete' : 'optional-skipped',
      lines: [draft.importedMembers.length > 0 ? `${draft.importedMembers.length} member${draft.importedMembers.length === 1 ? '' : 's'} ready to import` : 'Skipped'],
    },
  ];
}

export function StepReview({ onBack, onSaveDraft, onFinished }: { onBack: () => void; onSaveDraft: () => void; onFinished: (result: unknown) => void }) {
  const { state, dispatch } = useWizard();
  const { draft } = state;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = buildReviewRows(draft);

  function goToStep(step: WizardStep) {
    dispatch({ type: 'goToStep', step });
  }

  async function handleFinish() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    let idempotencyKey = state.idempotencyKey;
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      dispatch({ type: 'ensureIdempotencyKey', key: idempotencyKey });
    }

    try {
      const response = await fetch('/api/superadmin/onboarding/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          gym: { gymName: draft.gym.gymName, branchName: draft.gym.branchName, address: draft.gym.address, slug: draft.gym.slug },
          owner: draft.owner,
          staff: draft.staff,
          plans: draft.plans,
          operatingHours: draft.operatingHours,
          switches: draft.switches,
          importedMembers: draft.importedMembers.map((m) => ({ name: m.name, email: m.email, contactNumber: m.contactNumber })),
          logoDataUrl: draft.gym.logoDataUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 207) {
        throw new Error(data.error ?? 'Failed to finish setup.');
      }
      onFinished({
        gymId: data.gymId, gymName: data.gymName, gymCode: data.gymCode,
        ownerEmail: data.ownerEmail, expiresAt: data.expiresAt,
        claimLink: data.claimLink, emailDelivered: data.emailDelivered,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to finish setup.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="onboarding-step-enter space-y-4">
      <div>
        <h2 className="text-base font-semibold" style={{ color: A.text }}>Review &amp; Invite</h2>
        <p className="text-xs mt-1" style={{ color: A.muted }}>
          Finishing setup creates the gym and sends {draft.owner.name || 'the owner'} a claim invitation. They must formally
          claim ownership; you can keep managing the gym while their claim is pending.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <button
            key={`${row.title}-${index}`}
            type="button"
            onClick={() => goToStep(row.step)}
            className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left"
            style={{ backgroundColor: A.surface2, border: `1px solid ${A.border}` }}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {row.status === 'complete' ? (
                <CheckCircle2 className="onboarding-check-pop h-4 w-4 mt-0.5 shrink-0" style={{ color: 'hsl(var(--admin-active-text))' }} />
              ) : (
                <span
                  className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                  style={{ backgroundColor: 'hsl(38 92% 95%)', color: 'hsl(38 92% 35%)' }}
                >
                  Optional
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: A.text }}>{row.title}</p>
                {row.lines.map((line, lineIndex) => (
                  <p key={lineIndex} className="text-xs truncate" style={{ color: A.muted }}>{line}</p>
                ))}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: A.muted }} />
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-xs" style={{ color: A.danger }}>{error}</p>
      )}
      <span className="sr-only" role="status">{submitting ? 'Setting up the gym, please wait…' : ''}</span>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <GhostBtn onClick={onBack} disabled={submitting}>Back</GhostBtn>
          <GhostBtn onClick={onSaveDraft} disabled={submitting}>Save draft</GhostBtn>
        </div>
        <PrimaryBtn onClick={() => void handleFinish()} disabled={submitting}>
          {submitting ? 'Setting up…' : 'Finish setup'}
        </PrimaryBtn>
      </div>
    </div>
  );
}
