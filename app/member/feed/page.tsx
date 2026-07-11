import { FeedClient } from './FeedClient';
import { requireFeature } from '@/lib/permissions-server';

export default async function FeedPage() {
  await requireFeature('member_feed', '/member');
  return <FeedClient />;
}
