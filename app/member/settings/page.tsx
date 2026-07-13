'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  LogOut,
  Info,
  Mail,
  Shield,
  KeyRound,
  AlertTriangle,
  Flame,
  BellOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageSkeleton } from '@/components/ui/loading-screen';

interface NotificationPreferences {
  inactivity_nudges_enabled: boolean;
  streak_notifications_enabled: boolean;
}

type MemberNotificationPreferencesInsert = Database['public']['Tables']['member_notification_preferences']['Insert'];

function SettingsRow({
  icon,
  label,
  sublabel,
  onClick,
  danger = false,
  hideChevron = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick?: () => void;
  danger?: boolean;
  hideChevron?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-black/2 text-left disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div
        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor: danger ? 'var(--color-danger-bg)' : 'var(--color-surface)',
          color: danger ? 'var(--color-danger)' : 'var(--color-primary)',
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: danger ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
          {label}
        </p>
        {sublabel && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sublabel}</p>
        )}
      </div>
      {!hideChevron && (
        <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
      )}
    </button>
  );
}

function ToggleRow({
  icon,
  label,
  sublabel,
  enabled,
  onToggle,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div
        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-primary)',
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {label}
        </p>
        {sublabel && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{sublabel}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        role="switch"
        aria-checked={enabled}
        className="relative w-11 h-6 rounded-full transition-colors duration-200 disabled:opacity-50"
        style={{
          backgroundColor: enabled ? 'var(--color-primary)' : 'var(--color-surface)',
        }}
        aria-label={`Toggle ${label}`}
      >
        <div
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            transform: enabled ? 'translateX(22px)' : 'translateX(2px)',
          }}
        />
      </button>
    </div>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && (
        <p className="text-xs font-semibold uppercase tracking-widest px-1 mb-2"
          style={{ color: 'var(--color-text-muted)' }}>
          {title}
        </p>
      )}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--color-white)',
          border: '1px solid var(--color-surface)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--color-surface)' }} />;
}

export default function SettingsPage() {
  const { profile, signOut, isSigningOut, needsPasswordSetup, completePasswordSetup, signIn } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>({
    inactivity_nudges_enabled: true,
    streak_notifications_enabled: true,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadNotificationPrefs = useCallback(async () => {
    if (!profile?.id || !profile?.gymId) return;
    
    const { data } = await supabase
      .from('member_notification_preferences')
      .select('inactivity_nudges_enabled, streak_notifications_enabled')
      .eq('member_id', profile.id)
      .single();
    
    if (data) {
      setNotifPrefs({
        inactivity_nudges_enabled: data.inactivity_nudges_enabled,
        streak_notifications_enabled: data.streak_notifications_enabled,
      });
    }
    setLoadingPrefs(false);
  }, [profile?.id, profile?.gymId, supabase]);

  useEffect(() => {
    loadNotificationPrefs();
  }, [loadNotificationPrefs]);

  async function toggleNotifPref(key: keyof NotificationPreferences) {
    if (!profile?.id || !profile?.gymId || savingPrefs) return;
    
    const newValue = !notifPrefs[key];
    const oldPrefs = { ...notifPrefs };
    
    // Optimistic update
    setNotifPrefs(prev => ({ ...prev, [key]: newValue }));
    setSavingPrefs(true);

    const payload: MemberNotificationPreferencesInsert = {
      member_id: profile.id,
      gym_id: profile.gymId,
      updated_at: new Date().toISOString(),
    };

    if (key === 'inactivity_nudges_enabled') {
      payload.inactivity_nudges_enabled = newValue;
    } else {
      payload.streak_notifications_enabled = newValue;
    }
    
    // Upsert preference
    const { error } = await supabase
      .from('member_notification_preferences')
      .upsert(payload, {
        onConflict: 'member_id',
      });
    
    setSavingPrefs(false);
    
    if (error) {
      // Revert on error
      setNotifPrefs(oldPrefs);
      toast.error('Failed to update preference');
      return;
    }
    
    toast.success(newValue ? 'Notifications enabled' : 'Notifications disabled');
  }

  if (!profile) return <PageSkeleton rows={3} height={80} />;

  async function handleSignOut() {
    if (isSigningOut) return;
    await signOut();
  }

  function openPasswordModal() {
    setPasswordValue('');
    setConfirmPasswordValue('');
    setShowPasswordModal(true);
  }

  async function handleSavePassword() {
    if (!profile?.id || isSavingPassword) return;

    if (passwordValue.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    if (passwordValue !== confirmPasswordValue) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwordValue });
    const isTransientPasswordRotationError = Boolean(error && 'status' in error && (error as { status?: number }).status === 406)
    if (error && !isTransientPasswordRotationError) {
      setIsSavingPassword(false);
      toast.error(error.message || 'Failed to update password.');
      return;
    }

    const signInResult = await signIn(profile.email, passwordValue);
    setIsSavingPassword(false);

    if (signInResult.error) {
      toast.error(signInResult.error || 'Password updated, but session refresh failed. Please sign in again.');
      return;
    }

    completePasswordSetup(profile.id);
    setShowPasswordModal(false);
    setPasswordValue('');
    setConfirmPasswordValue('');
    toast.success('Password updated successfully.');
  }

  return (
    <div className="member-page space-y-6">
      <div>
        <h1 className="member-page-title">Settings</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          Manage your account and the updates you receive.
        </p>
      </div>

      {needsPasswordSetup && (
        <div
          className="rounded-2xl border px-4 py-3.5"
          style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--color-warning-bg)' }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} style={{ color: 'var(--color-warning)', marginTop: 1 }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                One-time login detected
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                Your password is not set yet. For security, set a password now so you can log in without a magic link.
              </p>
              <button
                onClick={openPasswordModal}
                className="mt-2 text-xs font-semibold underline underline-offset-2 disabled:opacity-50"
                style={{ color: 'var(--color-text-primary)' }}
              >
                Set password in app
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
      {/* Account */}
      <SectionCard title="Account">
        <div className="px-4 py-3.5 flex items-center gap-4">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
            style={{ backgroundColor: 'var(--color-primary-glow)', color: 'var(--color-primary)' }}
          >
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{profile.name}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{profile.email}</p>
          </div>
        </div>
        <Divider />
        <SettingsRow
          icon={<Shield size={17} />}
          label="Edit Profile"
          sublabel="Name, contact number, and QR code"
          onClick={() => router.push('/member/profile')}
        />
        <Divider />
        <SettingsRow
          icon={<KeyRound size={17} />}
          label="Change Password"
          sublabel="Update your password without leaving the app"
          onClick={openPasswordModal}
          hideChevron
        />
      </SectionCard>

      {/* Notifications */}
      <SectionCard title="Notifications">
        <ToggleRow
          icon={<BellOff size={17} />}
          label="Workout Reminders"
          sublabel="Get a gentle nudge when you've been away"
          enabled={notifPrefs.inactivity_nudges_enabled}
          onToggle={() => toggleNotifPref('inactivity_nudges_enabled')}
          disabled={loadingPrefs || savingPrefs}
        />
        <Divider />
        <ToggleRow
          icon={<Flame size={17} />}
          label="Weekly consistency updates"
          sublabel="Celebrate your consistency milestones"
          enabled={notifPrefs.streak_notifications_enabled}
          onToggle={() => toggleNotifPref('streak_notifications_enabled')}
          disabled={loadingPrefs || savingPrefs}
        />
      </SectionCard>

      {/* App */}
      <SectionCard title="App">
        <SettingsRow
          icon={<Info size={17} />}
          label="About Stren"
          sublabel="Version 1.0 · Built for local gyms"
          hideChevron
        />
        <Divider />
        <SettingsRow
          icon={<Mail size={17} />}
          label="Contact Us"
          sublabel="Get help or send feedback"
          onClick={() => window.open('mailto:support@stren.app', '_blank')}
        />
      </SectionCard>

      {/* Actions */}
      <SectionCard title="Account Actions">
        <SettingsRow
          icon={<LogOut size={17} />}
          label={isSigningOut ? 'Signing Out...' : 'Sign Out'}
          onClick={handleSignOut}
          danger
          hideChevron
          disabled={isSigningOut}
        />
      </SectionCard>
      </div>

      <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Member since {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
      </p>

      {showPasswordModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--color-white)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>Change Password</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Choose a new password for email sign-in. This replaces the temporary login link.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  placeholder="At least 6 characters"
                  disabled={isSavingPassword}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPasswordValue}
                  onChange={(e) => setConfirmPasswordValue(e.target.value)}
                  placeholder="Repeat password"
                  disabled={isSavingPassword}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowPasswordModal(false)}
                disabled={isSavingPassword}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50"
                style={{ borderColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePassword}
                disabled={isSavingPassword}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)', color: 'white' }}
              >
                {isSavingPassword ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
