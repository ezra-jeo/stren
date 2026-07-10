'use client';

import { AccessClient } from '@/components/admin/AccessClient';

// People & access (ImplementationPlan.md §7.9). Client page for now; Agent B adds
// the server guard `requirePermission('roles:manage')` after this merges.
export default function AccessPage() {
  return <AccessClient />;
}
