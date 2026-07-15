'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMemo } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Bell, UserPlus, LogIn, AlertCircle, X, CheckCheck, CreditCard, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { privateCacheKey } from '@/lib/private-cache';
import { ViewportOverlay } from '@/components/ui/viewport-overlay';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  member_id: string | null;
  for_member: boolean | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  member_pending:      <UserPlus size={15} />,
  member_checkin:      <LogIn size={15} />,
  membership_expiring: <AlertCircle size={15} />,
  payment_recorded: <CreditCard size={15} />,
  membership_verification_reminder: <RefreshCw size={15} />,
};

const TYPE_COLOR: Record<string, string> = {
  member_pending:      '#D97706',
  member_checkin:      '#16A34A',
  membership_expiring: '#DC2626',
  payment_recorded: '#2563EB',
  membership_verification_reminder: '#D97706',
};

const TYPE_BG: Record<string, string> = {
  member_pending:      '#FFFBEB',
  member_checkin:      '#ECFDF3',
  membership_expiring: '#FEF2F2',
  payment_recorded: '#EFF6FF',
  membership_verification_reminder: '#FFFBEB',
};

export function NotificationsPanel() {
  const { activeScope } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const loadScopeRef = useRef<string | null>(null);
  const [notificationsScopeKey, setNotificationsScopeKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scopeKey = activeScope ? privateCacheKey('manager-notifications', activeScope) : null;
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
    const requestKey = privateCacheKey('manager-notifications', activeScope);
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, is_read, created_at, member_id, for_member')
      .eq('gym_id', activeScope.gymId)
      .eq('for_member', false)
      .order('created_at', { ascending: false })
      .limit(30);
    if (loadScopeRef.current !== requestKey) return;
    if (error) {
      setLoadError('Notifications could not refresh.');
      return;
    }
    setNotifications((data as Notification[]) ?? []);
    setNotificationsScopeKey(requestKey);
    setLoadError(null);
  }, [activeScope, supabase]);

  useEffect(() => { load(); }, [load]);

  // Realtime — new notifications appear instantly
  useEffect(() => {
    if (!activeScope) return;
    const requestKey = privateCacheKey('manager-notifications', activeScope);
    const channelName = `notifications-${activeScope.gymId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase.channel(channelName);
      channel.on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `gym_id=eq.${activeScope.gymId}`,
      }, (payload) => {
        const next = payload.new as Notification;
        if (loadScopeRef.current === requestKey && next.for_member !== true) {
          setNotificationsScopeKey(requestKey);
          setNotifications((prev) => [next, ...prev.slice(0, 29)]);
        }
      });
      channel.subscribe();
    } catch (error) {
      console.error('Failed to initialize notifications realtime channel', error);
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [activeScope, supabase]);

  async function markAllRead() {
    if (!activeScope) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('gym_id', activeScope.gymId)
      .eq('for_member', false)
      .eq('is_read', false);
    if (error) {
      setLoadError('Notifications could not be marked as read.');
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  async function markRead(id: string) {
    if (!activeScope) return;
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('gym_id', activeScope.gymId).eq('for_member', false);
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
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg transition-colors"
        style={{ color: 'var(--color-gray)' }}
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: 'var(--color-danger)', color: 'white' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <ViewportOverlay
          onClose={() => setOpen(false)}
          labelledBy="manager-notifications-title"
          panelClassName="w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl shadow-xl"
          panelStyle={{ backgroundColor: '#ffffff', border: '1px solid var(--admin-border)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--admin-border)' }}>
            <div className="flex items-center gap-2">
              <Bell size={16} style={{ color: 'var(--color-primary)' }} />
              <span id="manager-notifications-title" className="text-sm font-semibold" style={{ color: '#1A1A1A' }}>Notifications</span>
              {unreadCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: '#5A5A5A' }} title="Mark all read">
                  <CheckCheck size={14} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-black/5" style={{ color: '#9A9A9A' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 'min(400px, calc(100vh - 8rem))' }}>
            {visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Bell size={32} style={{ color: '#D1C9BE', marginBottom: 8 }} />
                <p className="text-sm font-medium" style={{ color: '#5A5A5A' }}>{loadError ? 'Could not refresh notifications' : 'All caught up!'}</p>
                <p className="text-xs mt-1" style={{ color: '#9A9A9A' }}>{loadError ?? 'No notifications yet'}</p>
              </div>
            ) : (
              visibleNotifications.map((n, i) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-black/2"
                  style={{ borderTop: i > 0 ? '1px solid #F3F1EE' : 'none', backgroundColor: n.is_read ? 'transparent' : '#FAFAF9' }}
                >
                  <div className="mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: TYPE_BG[n.type] ?? '#F3F1EE', color: TYPE_COLOR[n.type] ?? '#5A5A5A' }}>
                    {TYPE_ICON[n.type] ?? <AlertCircle size={15} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: '#1A1A1A' }}>{n.title}</p>
                    {n.body && <p className="text-xs mt-0.5 truncate" style={{ color: '#5A5A5A' }}>{n.body}</p>}
                    <p className="text-xs mt-1" style={{ color: '#9A9A9A' }}>
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
