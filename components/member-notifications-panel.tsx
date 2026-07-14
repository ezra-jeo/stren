'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Bell, Flame, Calendar, Megaphone, Activity, X, CheckCheck, BadgeCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { privateCacheKey } from '@/lib/private-cache';
import { ViewportOverlay } from '@/components/ui/viewport-overlay';

type MemberNotificationKind =
  | 'membership_expiry_7d'
  | 'membership_expiry_0d'
  | 'streak_milestone'
  | 'inactivity_nudge'
  | 'announcement'
  | 'membership_verified';

interface MemberNotification {
  id: string;
  notification_type: MemberNotificationKind;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

const MEMBER_NOTIFICATION_KINDS = new Set<MemberNotificationKind>([
  'membership_expiry_7d',
  'membership_expiry_0d',
  'streak_milestone',
  'inactivity_nudge',
  'announcement',
  'membership_verified',
]);

export function normalizeMemberNotification(row: Record<string, unknown>): MemberNotification | null {
  const rawType = row.notification_type ?? row.type;
  if (
    typeof row.id !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof rawType !== 'string' ||
    !MEMBER_NOTIFICATION_KINDS.has(rawType as MemberNotificationKind)
  ) return null;
  return {
    id: row.id,
    notification_type: rawType as MemberNotificationKind,
    title: row.title,
    body: typeof row.body === 'string' ? row.body : null,
    is_read: row.is_read === true,
    created_at: row.created_at,
  };
}

const TYPE_ICON: Record<MemberNotification['notification_type'], React.ReactNode> = {
  membership_expiry_7d: <Calendar size={15} />,
  membership_expiry_0d: <Calendar size={15} />,
  streak_milestone:     <Flame size={15} />,
  inactivity_nudge:     <Activity size={15} />,
  announcement:         <Megaphone size={15} />,
  membership_verified:  <BadgeCheck size={15} />,
};

const TYPE_COLOR: Record<MemberNotification['notification_type'], string> = {
  membership_expiry_7d: '#D97706',
  membership_expiry_0d: '#DC2626',
  streak_milestone:     '#EA580C',
  inactivity_nudge:     '#16A34A',
  announcement:         '#7C3AED',
  membership_verified:  '#16A34A',
};

const TYPE_BG: Record<MemberNotification['notification_type'], string> = {
  membership_expiry_7d: '#FFFBEB',
  membership_expiry_0d: '#FEF2F2',
  streak_milestone:     '#FFF7ED',
  inactivity_nudge:     '#ECFDF3',
  announcement:         '#F5F3FF',
  membership_verified:  '#ECFDF3',
};

export function MemberNotificationsPanel() {
  const { activeScope } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const loadScopeRef = useRef<string | null>(null);
  const [notificationsScopeKey, setNotificationsScopeKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scopeKey = activeScope ? privateCacheKey('member-notifications', activeScope) : null;
  loadScopeRef.current = scopeKey;
  const visibleNotifications = notificationsScopeKey === scopeKey ? notifications : [];

  const unreadCount = visibleNotifications.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    if (!activeScope) {
      setNotifications([]);
      setNotificationsScopeKey(null);
      setLoadError(null);
      return;
    }
    const requestKey = privateCacheKey('member-notifications', activeScope);
    const { data, error } = await supabase
      .from('notifications')
      .select('id, notification_type, type, title, body, is_read, created_at, member_id, gym_id, for_member')
      .eq('member_id', activeScope.profileId)
      .eq('gym_id', activeScope.gymId)
      .eq('for_member', true)
      .order('created_at', { ascending: false })
      .limit(30);
    if (loadScopeRef.current !== requestKey) return;
    if (error) {
      setLoadError('Notifications could not refresh.');
      return;
    }
    const normalized = ((data ?? []) as Record<string, unknown>[])
      .map(normalizeMemberNotification)
      .filter((item): item is MemberNotification => item !== null);
    setNotifications(normalized);
    setNotificationsScopeKey(requestKey);
    setLoadError(null);
  }, [activeScope, supabase]);

  useEffect(() => { load(); }, [load]);

  // Realtime — new notifications appear instantly
  useEffect(() => {
    if (!activeScope) return;
    const requestKey = privateCacheKey('member-notifications', activeScope);
    const profileId = activeScope.profileId;
    const channelName = `member-notifications-${profileId}-${activeScope.gymId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(channelName);
      channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `gym_id=eq.${activeScope.gymId}`,
      }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        const next = normalizeMemberNotification(row);
        if (loadScopeRef.current === requestKey && row.member_id === profileId && row.for_member === true && next) {
          setNotificationsScopeKey(requestKey);
          setNotifications((prev) => [next, ...prev.slice(0, 29)]);
        }
      });
      channel.subscribe();
    } catch (error) {
      console.error('Failed to initialize member notifications realtime channel', error);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [activeScope, supabase]);

  const close = useCallback(() => setOpen(false), []);

  async function markAllRead() {
    if (!activeScope) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('member_id', activeScope.profileId)
      .eq('gym_id', activeScope.gymId)
      .eq('for_member', true)
      .eq('is_read', false);
    if (error) {
      setLoadError('Notifications could not be marked as read.');
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function markRead(id: string) {
    if (!activeScope) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('member_id', activeScope.profileId).eq('gym_id', activeScope.gymId).eq('for_member', true);
    if (error) {
      setLoadError('This notification could not be marked as read.');
      return;
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative p-2 rounded-lg transition-colors"
        style={{ color: 'var(--color-text-secondary)' }}
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold px-1"
            style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <ViewportOverlay
          onClose={close}
          labelledBy="member-notifications-title"
          panelClassName="w-[calc(100vw-2rem)] max-w-sm rounded-2xl shadow-xl overflow-hidden"
          panelStyle={{ backgroundColor: 'var(--color-white)', border: '1px solid var(--color-surface)' }}
        >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-surface)' }}>
                <div className="flex items-center gap-2">
                  <Bell size={16} style={{ color: 'var(--color-primary)' }} />
                  <span id="member-notifications-title" className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--color-text-muted)' }} title="Mark all read">
                      <CheckCheck size={14} />
                    </button>
                  )}
                  <button aria-label="Close notifications" onClick={close} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: 'var(--color-text-muted)' }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto" style={{ maxHeight: 'min(400px, calc(100vh - 8rem))' }}>
                {visibleNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                    <Bell size={32} style={{ color: 'var(--color-surface)', marginBottom: 8 }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{loadError ? 'Could not refresh notifications' : 'All caught up!'}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{loadError ?? 'No notifications yet'}</p>
                  </div>
                ) : (
                  visibleNotifications.map((n, i) => (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-black/2"
                      style={{ borderTop: i > 0 ? '1px solid var(--color-surface)' : 'none', backgroundColor: n.is_read ? 'transparent' : 'var(--color-primary-glow)' }}
                    >
                      <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: TYPE_BG[n.notification_type], color: TYPE_COLOR[n.notification_type] }}>
                        {TYPE_ICON[n.notification_type]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{n.title}</p>
                        {n.body && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-secondary)' }}>{n.body}</p>}
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {!n.is_read && (
                        <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-primary)' }} />
                      )}
                    </button>
                  ))
                )}
              </div>
        </ViewportOverlay>
      )}
    </div>
  );
}
