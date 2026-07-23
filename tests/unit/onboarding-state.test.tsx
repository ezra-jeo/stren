import { describe, expect, it } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  INITIAL_DRAFT, isStepValid, useWizard, WizardProvider, type OnboardingDraft,
} from '@/lib/onboarding/state';

function Probe() {
  const { state, dispatch } = useWizard();
  return (
    <div>
      <span data-testid="step">{state.currentStep}</span>
      <span data-testid="slug">{state.draft.gym.slug}</span>
      <span data-testid="completed">{state.completedSteps.join(',')}</span>
      <button onClick={() => dispatch({ type: 'setGym', patch: { gymName: 'Iron Fitness' } })}>set-name</button>
      <button onClick={() => dispatch({ type: 'setGym', patch: { slug: 'custom-slug', slugTouched: true } })}>set-slug</button>
      <button onClick={() => dispatch({ type: 'markStepComplete', step: 'gym' })}>complete-gym</button>
      <button onClick={() => dispatch({ type: 'markStepComplete', step: 'ownerStaff' })}>complete-owner</button>
      <button onClick={() => dispatch({ type: 'invalidateFrom', step: 'ownerStaff' })}>invalidate</button>
    </div>
  );
}

describe('isStepValid (required-field blocking)', () => {
  it('gym step is invalid until name, address, and a valid slug are present', () => {
    expect(isStepValid('gym', INITIAL_DRAFT)).toBe(false);
    const filled: OnboardingDraft = { ...INITIAL_DRAFT, gym: { ...INITIAL_DRAFT.gym, gymName: 'Iron Fitness', address: 'Manila', slug: 'iron-fitness' } };
    expect(isStepValid('gym', filled)).toBe(true);
  });

  it('ownerStaff step requires a valid owner (email, PH mobile, consent)', () => {
    expect(isStepValid('ownerStaff', INITIAL_DRAFT)).toBe(false);
    const filled: OnboardingDraft = {
      ...INITIAL_DRAFT,
      owner: { name: 'Jane Owner', email: 'jane@example.com', mobile: '+639171234567', role: 'owner', consentMethod: 'in_person' },
    };
    expect(isStepValid('ownerStaff', filled)).toBe(true);
  });

  it('planAccess step is valid with the prefilled default plan and default hours', () => {
    // §9: the default plan (price 0, editable) and 5 AM-10 PM defaults are
    // intentionally already valid so the operator can proceed without typing.
    expect(isStepValid('planAccess', INITIAL_DRAFT)).toBe(true);
  });

  it('planAccess step is invalid once the plan list is emptied', () => {
    const emptied: OnboardingDraft = { ...INITIAL_DRAFT, plans: [] };
    expect(isStepValid('planAccess', emptied)).toBe(false);
  });

  it('planAccess step is invalid when all days are closed', () => {
    const closedAll = Object.fromEntries(
      Object.keys(INITIAL_DRAFT.operatingHours).map((day) => [day, { closed: true, open: '', close: '' }]),
    ) as OnboardingDraft['operatingHours'];
    const draft: OnboardingDraft = {
      ...INITIAL_DRAFT,
      plans: [{ id: '1', name: 'Monthly', price: 500, durationValue: 1, durationUnit: 'months', description: '', isActive: true }],
      operatingHours: closedAll,
    };
    expect(isStepValid('planAccess', draft)).toBe(false);
  });
});

describe('WizardProvider reducer behavior', () => {
  it('auto-syncs slug from gym name until the operator edits it directly', () => {
    render(<WizardProvider><Probe /></WizardProvider>);
    act(() => screen.getByText('set-name').click());
    expect(screen.getByTestId('slug').textContent).toBe('iron-fitness');

    act(() => screen.getByText('set-slug').click());
    expect(screen.getByTestId('slug').textContent).toBe('custom-slug');

    // Further name edits no longer overwrite the manually-edited slug.
    act(() => screen.getByText('set-name').click());
    expect(screen.getByTestId('slug').textContent).toBe('custom-slug');
  });

  it('invalidating an earlier step removes only steps at or after it', () => {
    render(<WizardProvider><Probe /></WizardProvider>);
    act(() => screen.getByText('complete-gym').click());
    act(() => screen.getByText('complete-owner').click());
    expect(screen.getByTestId('completed').textContent).toBe('gym,ownerStaff');

    act(() => screen.getByText('invalidate').click());
    expect(screen.getByTestId('completed').textContent).toBe('gym');
  });
});

