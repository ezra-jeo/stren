'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { A, ACard } from '@/lib/admin-ui';
import { WizardProvider, useWizard, type WizardStep } from '@/lib/onboarding/state';
import { toPreviewData } from '@/lib/onboarding/preview';
import { WizardTimeline } from '@/components/superadmin/WizardTimeline';
import { PreviewColumn } from '@/components/superadmin/PreviewColumn';
import { StepGym } from '@/components/superadmin/steps/StepGym';
import { StepOwnerStaff } from '@/components/superadmin/steps/StepOwnerStaff';
import { StepPlanAccess } from '@/components/superadmin/steps/StepPlanAccess';
import { StepReview } from '@/components/superadmin/steps/StepReview';
import { SuccessState, type ProvisionResult } from '@/components/superadmin/SuccessState';

export function OnboardingWizard() {
  return (
    <WizardProvider>
      <OnboardingWizardInner />
    </WizardProvider>
  );
}

function OnboardingWizardInner() {
  const { state, dispatch, saveDraft } = useWizard();
  const [successResult, setSuccessResult] = useState<ProvisionResult | null>(null);
  const previewData = useMemo(() => toPreviewData(state.draft), [state.draft]);

  function goTo(step: WizardStep) {
    dispatch({ type: 'goToStep', step });
  }

  function handleSaveDraft() {
    saveDraft();
    toast.success('Changes are saved for this setup session.');
  }

  function handleFinished(result: unknown) {
    setSuccessResult(result as ProvisionResult);
  }

  function handleReturn() {
    dispatch({ type: 'reset' });
    setSuccessResult(null);
  }

  if (successResult) return <SuccessState result={successResult} onReturn={handleReturn} />;

  const stepComplete = state.completedSteps.includes(state.currentStep);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: A.text }}>
          Assisted Onboarding
        </h1>
        <p className="text-sm mt-1" style={{ color: A.muted }}>
          We&rsquo;ll get the gym set up in minutes. Fast, smooth, and painless.
        </p>
      </div>

      <WizardTimeline currentStep={state.currentStep} completedSteps={state.completedSteps} onSelect={goTo} />

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <ACard className="flex-1 min-w-0 p-6">
          {state.currentStep === 'gym' && (
            <StepGym onContinue={() => goTo('ownerStaff')} onSaveDraft={handleSaveDraft} />
          )}
          {state.currentStep === 'ownerStaff' && (
            <StepOwnerStaff onContinue={() => goTo('planAccess')} onBack={() => goTo('gym')} onSaveDraft={handleSaveDraft} />
          )}
          {state.currentStep === 'planAccess' && (
            <StepPlanAccess onContinue={() => goTo('review')} onBack={() => goTo('ownerStaff')} onSaveDraft={handleSaveDraft} />
          )}
          {state.currentStep === 'review' && (
            <StepReview onBack={() => goTo('planAccess')} onSaveDraft={handleSaveDraft} onFinished={handleFinished} />
          )}
        </ACard>

        <PreviewColumn data={previewData} step={state.currentStep} stepComplete={stepComplete} />
      </div>
    </div>
  );
}
