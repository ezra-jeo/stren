'use client';

import { useRef } from 'react';
import { Check } from 'lucide-react';
import { A } from '@/lib/admin-ui';
import { WIZARD_STEPS, type WizardStep } from '@/lib/onboarding/state';

const STEP_LABELS: Record<WizardStep, string> = {
  gym: 'Gym',
  ownerStaff: 'Owner & Staff',
  planAccess: 'Plan & Access',
  review: 'Review & Invite',
};

interface Props {
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  onSelect: (step: WizardStep) => void;
}

export function WizardTimeline({ currentStep, completedSteps, onSelect }: Props) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentIndex = WIZARD_STEPS.indexOf(currentStep);
  const progressPercent = (currentIndex / (WIZARD_STEPS.length - 1)) * 100;

  function isReachable(step: WizardStep, index: number): boolean {
    return completedSteps.includes(step) || index === currentIndex || index === 0
      || completedSteps.includes(WIZARD_STEPS[index - 1]);
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    let next = index + direction;
    while (next >= 0 && next < WIZARD_STEPS.length) {
      if (isReachable(WIZARD_STEPS[next], next)) {
        buttonRefs.current[next]?.focus();
        return;
      }
      next += direction;
    }
  }

  return (
    <nav aria-label="Onboarding steps" className="relative">
      <div className="absolute left-0 right-0 top-4 h-0.5" style={{ backgroundColor: A.border }}>
        <div
          className="onboarding-timeline-progress h-full"
          style={{ width: `${progressPercent}%`, backgroundColor: A.primary }}
        />
      </div>
      <ol className="relative flex items-start justify-between gap-2">
        {WIZARD_STEPS.map((step, index) => {
          const completed = completedSteps.includes(step);
          const current = step === currentStep;
          const reachable = isReachable(step, index);
          return (
            <li key={step} className="flex flex-1 flex-col items-center gap-2 text-center">
              <button
                ref={(el) => { buttonRefs.current[index] = el; }}
                type="button"
                disabled={!reachable}
                aria-current={current ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${STEP_LABELS[step]}${completed ? ' (completed)' : ''}`}
                onClick={() => reachable && onSelect(step)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: completed
                    ? 'hsl(var(--admin-active-bg))'
                    : current
                      ? A.primary
                      : A.surface2,
                  color: completed
                    ? 'hsl(var(--admin-active-text))'
                    : current
                      ? 'white'
                      : reachable
                        ? A.text
                        : A.muted,
                  border: `1px solid ${completed ? 'hsl(var(--admin-active-border))' : current ? A.primary : A.border}`,
                  outlineColor: A.primary,
                }}
              >
                {completed ? <Check className="onboarding-check-pop h-4 w-4" /> : index + 1}
              </button>
              <span
                className="text-xs font-medium"
                style={{ color: current ? A.text : A.muted }}
              >
                {STEP_LABELS[step]}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
