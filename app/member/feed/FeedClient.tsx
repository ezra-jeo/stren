'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { FeedItem } from '@/lib/types';
import { MessageCircle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PageSkeleton } from '@/components/ui/loading-screen';

export function FeedClient() {
  const { profile } = useAuth();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const loadFeed = useCallback(async () => {
    const [{ data }, { data: directory }] = await Promise.all([
      supabase
        .from('feed_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.rpc('get_gym_directory'),
    ]);

    if (data) {
      const items: FeedItem[] = [];
      const directoryByUserId = new Map(
        (directory ?? []).map((entry) => [entry.user_id, entry]),
      );

      for (const item of data) {
        if (!isSupportedFeedType(item.type)) continue;

        const profileData = item.member_id ? directoryByUserId.get(item.member_id) : null;
        items.push({
          id: item.id,
          memberId: item.member_id ?? "",
          type: item.type,
          title: item.title,
          description: item.description,
          metadata: item.metadata as Record<string, unknown> | null,
          createdAt: item.created_at ?? "",
          memberName: profileData?.name ?? 'Unknown',
          memberAvatar: profileData?.avatar_url ?? null,
        });
      }

      setFeedItems(items);
    }
    setIsLoading(false);
  }, [supabase, profile]);

  useEffect(() => {
    loadFeed();

    const channel = supabase
      .channel('feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_items' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const newItem: FeedItem = {
          id: row.id as string,
          memberId: row.member_id as string,
          type: row.type as FeedItem['type'],
          title: row.title as string,
          description: (row.description as string) ?? null,
          metadata: (row.metadata as Record<string, unknown>) ?? null,
          createdAt: row.created_at as string,
          memberName: 'Gym Member',
          memberAvatar: null,
        };
        setFeedItems((prev) => [newItem, ...prev.slice(0, 49)]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeed, supabase]);

  if (isLoading) return <PageSkeleton rows={5} height={112} />;

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
        >
          Activity Feed
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          See what the gym community is up to
        </p>
      </div>

      {feedItems.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--color-text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>No activity yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Check in at the gym to get started!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedItems.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedCard({
  item,
}: {
  item: FeedItem;
}) {
  const typeIcon = getFeedTypeIcon(item.type);
  const timeAgo = formatDistanceToNow(new Date(item.createdAt), { addSuffix: true });

  return (
    <div
      className="rounded-xl p-4 border"
      style={{ backgroundColor: 'var(--color-white)', borderColor: 'var(--color-surface)' }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: 'var(--color-primary-glow)' }}
        >
          {typeIcon}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm" style={{ color: 'var(--color-text-primary)' }}>
            {item.title}
          </p>
          {item.description && (
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              {item.description}
            </p>
          )}

          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Clock size={12} />
              {timeAgo}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getFeedTypeIcon(type: FeedItem['type']): string {
  switch (type) {
    case 'check_in': return '💪';
    case 'check_out': return '👋';
    case 'announcement': return '📢';
    case 'streak_milestone': return '🔥';
    default: return '📝';
  }
}

function isSupportedFeedType(type: string): type is FeedItem['type'] {
  return type === 'check_in' || type === 'check_out' || type === 'announcement' || type === 'streak_milestone';
}
