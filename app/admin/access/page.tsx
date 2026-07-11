import { AccessClient } from '@/components/admin/AccessClient';
import { requirePermission } from '@/lib/permissions-server';

// People & access (ImplementationPlan.md §7.9). Client page for now; Agent B adds
// the server guard `requirePermission('roles:manage')` after this merges.
export default async function AccessPage() {
  await requirePermission('roles:manage');
  return <AccessClient />;
}
