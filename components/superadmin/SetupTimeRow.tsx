'use client';

import { Timer } from 'lucide-react';
import { A } from '@/lib/admin-ui';
import { STEP_TIMER_COPY, type WizardStep } from '@/lib/onboarding/state';

/**
 * Compact info row beneath the preview column — deliberately distinct from
 * the preview cards above it (top border, tighter padding) so it never reads
 * as a misaligned fourth preview.
 */
export function SetupTimeRow({ step, complete }: { step: WizardStep; complete?: boolean }) {
  const label = complete ? 'Complete' : STEP_TIMER_COPY[step];
  return (
    <div className="pt-3 mt-1" style={{ borderTop: `1px solid ${A.border}` }}>
      <div className="flex items-center gap-2 px-1">
        <Timer className="h-3.5 w-3.5 shrink-0" style={{ color: A.muted }} aria-hidden="true" />
        <p className="text-xs font-medium" style={{ color: A.text2 }} role="status">
          {label}
        </p>
      </div>
      <p className="mt-0.5 px-1 text-xs" style={{ color: A.muted }}>
        Estimated time to finish this setup.
      </p>
    </div>
  );
}

