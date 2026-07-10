'use client';

import { GymPageStudio } from '@/components/admin/gym-studio/GymPageStudio';

// Re-skinned to the Gym Page Studio (ImplementationPlan.md §7). All state + the
// upload/compress/hash/cleanup/save/revalidate pipeline live in <GymPageStudio/>,
// lifted verbatim from the old form. This stays a client page for now; Agent B
// converts it to a server wrapper (guard + fetch + props) after this merges.
export default function GymProfilePage() {
  return <GymPageStudio />;
}
