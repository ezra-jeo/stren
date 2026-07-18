'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { slugify } from '@/lib/onboarding/slug';
import {
  gymStepSchema, ownerStaffStepSchema, plansStepSchema, validateOperatingHours,
  DEFAULT_OPERATING_HOURS, DEFAULT_ACCESS_SWITCHES,
  type OperatingHours, type AccessSwitches, type StaffEntryData, type PlanEntryData, type ConsentMethod,
} from '@/lib/onboarding/schemas';
import type { CsvValidRow } from '@/lib/onboarding/csv';

export const WIZARD_STEPS = ['gym', 'ownerStaff', 'planAccess', 'review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_TIMER_COPY: Record<WizardStep, string> = {
  gym: '2–3 minutes left',
  ownerStaff: '1–2 minutes left',
  planAccess: 'About 1 minute left',
  review: 'Almost done',
};

export interface OnboardingDraft {
  gym: {
    gymName: string;
    branchName: string;
    address: string;
    slug: string;
    slugTouched: boolean;
    logoDataUrl: string | null;
    logoFileName: string | null;
  };
  owner: {
    name: string;
    email: string;
    mobile: string;
    role: 'owner' | 'admin';
    consentMethod: ConsentMethod | '';
  };
  staff: StaffEntryData[];
  plans: PlanEntryData[];
  operatingHours: OperatingHours;
  switches: AccessSwitches;
  importedMembers: CsvValidRow[];
  importSkippedCount: number;
  importAttempted: boolean;
}

export const INITIAL_DRAFT: OnboardingDraft = {
  gym: { gymName: '', branchName: '', address: '', slug: '', slugTouched: false, logoDataUrl: null, logoFileName: null },
  owner: { name: '', email: '', mobile: '', role: 'owner', consentMethod: '' },
  staff: [],
  plans: [{
    id: 'default-plan', name: 'Monthly Membership', price: 0, durationValue: 1, durationUnit: 'months',
    description: '', isActive: true,
  }],
  operatingHours: DEFAULT_OPERATING_HOURS,
  switches: DEFAULT_ACCESS_SWITCHES,
  importedMembers: [],
  importSkippedCount: 0,
  importAttempted: false,
};

type Action =
  | { type: 'setGym'; patch: Partial<OnboardingDraft['gym']> }
  | { type: 'setOwner'; patch: Partial<OnboardingDraft['owner']> }
  | { type: 'setStaff'; staff: StaffEntryData[] }
  | { type: 'setPlans'; plans: PlanEntryData[] }
  | { type: 'setOperatingHours'; hours: OperatingHours }
  | { type: 'setSwitches'; patch: Partial<AccessSwitches> }
  | { type: 'setImport'; rows: CsvValidRow[]; skipped: number }
  | { type: 'goToStep'; step: WizardStep }
  | { type: 'markStepComplete'; step: WizardStep }
  | { type: 'invalidateFrom'; step: WizardStep }
  | { type: 'hydrate'; state: WizardState }
  | { type: 'ensureIdempotencyKey'; key: string }
  | { type: 'reset' };

export interface WizardState {
  draft: OnboardingDraft;
  currentStep: WizardStep;
  completedSteps: WizardStep[];
  idempotencyKey: string | null;
}

const INITIAL_STATE: WizardState = {
  draft: INITIAL_DRAFT,
  currentStep: 'gym',
  completedSteps: [],
  idempotencyKey: null,
};

function withoutStepsFrom(steps: WizardStep[], step: WizardStep): WizardStep[] {
  const index = WIZARD_STEPS.indexOf(step);
  return steps.filter((s) => WIZARD_STEPS.indexOf(s) < index);
}

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'setGym': {
      const gym = { ...state.draft.gym, ...action.patch };
      if (!gym.slugTouched && 'gymName' in action.patch) {
        gym.slug = slugify(gym.gymName);
      }
      return { ...state, draft: { ...state.draft, gym } };
    }
    case 'setOwner':
      return { ...state, draft: { ...state.draft, owner: { ...state.draft.owner, ...action.patch } } };
    case 'setStaff':
      return { ...state, draft: { ...state.draft, staff: action.staff } };
    case 'setPlans':
      return { ...state, draft: { ...state.draft, plans: action.plans } };
    case 'setOperatingHours':
      return { ...state, draft: { ...state.draft, operatingHours: action.hours } };
    case 'setSwitches':
      return { ...state, draft: { ...state.draft, switches: { ...state.draft.switches, ...action.patch } } };
    case 'setImport':
      return { ...state, draft: { ...state.draft, importedMembers: action.rows, importSkippedCount: action.skipped, importAttempted: true } };
    case 'goToStep':
      return { ...state, currentStep: action.step };
    case 'markStepComplete':
      return {
        ...state,
        completedSteps: state.completedSteps.includes(action.step)
          ? state.completedSteps
          : [...state.completedSteps, action.step],
      };
    case 'invalidateFrom':
      return { ...state, completedSteps: withoutStepsFrom(state.completedSteps, action.step) };
    case 'hydrate':
      return action.state;
    case 'ensureIdempotencyKey':
      return state.idempotencyKey ? state : { ...state, idempotencyKey: action.key };
    case 'reset':
      return INITIAL_STATE;
    default:
      return state;
  }
}

const SESSION_KEY = 'stren.assistedOnboarding.draft.v1';

function loadFromSession(): WizardState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as WizardState) : null;
  } catch {
    return null;
  }
}

function saveToSession(state: WizardState) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // Session-only persistence is best-effort; ignore quota/availability errors.
  }
}

/** Step-completeness gate — drives which timeline steps are reachable. */
export function isStepValid(step: WizardStep, draft: OnboardingDraft): boolean {
  switch (step) {
    case 'gym':
      return gymStepSchema.safeParse({
        gymName: draft.gym.gymName, branchName: draft.gym.branchName,
        address: draft.gym.address, slug: draft.gym.slug,
      }).success;
    case 'ownerStaff':
      return ownerStaffStepSchema.safeParse({ owner: draft.owner, staff: draft.staff }).success;
    case 'planAccess':
      return plansStepSchema.safeParse(draft.plans).success && validateOperatingHours(draft.operatingHours) === null;
    case 'review':
      return true;
    default:
      return false;
  }
}

interface WizardContextValue {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  saveDraft: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Hydrate once on mount only.
  useEffect(() => {
    const saved = loadFromSession();
    if (saved) dispatch({ type: 'hydrate', state: saved });
  }, []);

  const saveDraft = useCallback(() => saveToSession(state), [state]);

  const value = useMemo(() => ({ state, dispatch, saveDraft }), [state, saveDraft]);

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used within a WizardProvider');
  return ctx;
}
