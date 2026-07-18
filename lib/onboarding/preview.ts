import type { OnboardingDraft } from '@/lib/onboarding/state';

export interface PreviewData {
  gymName: string;
  branchName: string;
  slug: string;
  ownerName: string;
  location: string;
  logoUrl: string | null;
  planSummary: string;
  kioskEnabled: boolean;
  inviteQrEnabled: boolean;
}

/** Realistic placeholders — never a broken/empty-looking preview card. */
export function toPreviewData(draft: OnboardingDraft): PreviewData {
  const activePlans = draft.plans.filter((plan) => plan.isActive);
  const primaryPlan = activePlans[0] ?? draft.plans[0];
  const planSummary = primaryPlan
    ? `${primaryPlan.name || 'Membership plan'} · ₱${Number(primaryPlan.price || 0).toLocaleString()}${draft.plans.length > 1 ? ` +${draft.plans.length - 1} more` : ''}`
    : 'No plans yet';

  return {
    gymName: draft.gym.gymName.trim() || 'Your gym',
    branchName: draft.gym.branchName.trim() || draft.gym.gymName.trim() || 'Main Branch',
    slug: draft.gym.slug.trim() || 'gym-name',
    ownerName: draft.owner.name.trim() || 'Gym owner',
    location: draft.gym.address.trim() || 'Your location',
    logoUrl: draft.gym.logoDataUrl,
    planSummary,
    kioskEnabled: draft.switches.kioskCheckin,
    inviteQrEnabled: draft.switches.generateInviteQr,
  };
}
