'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createServerSupabaseClient } from './supabase-server';
import { resolvePostAuthDestinationForSession } from './post-auth-session';
import type { GymUserRole, GymUserStatus } from './types';
import { validateAccountSignup } from './auth-action-validation';

export async function signUpAccount(input: {
  name: string;
  email: string;
  password: string;
}): Promise<
  | { error: string; status?: never }
  | { error: null; status: 'already_exists' | 'authenticated' | 'verification_required' }
> {
  const validationError = validateAccountSignup(input);
  if (validationError) return { error: validationError };
  const supabase = await createServerSupabaseClient();
  const requestHeaders = await headers();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || requestHeaders.get('origin') || '').replace(/\/$/, '');
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { name: input.name.trim() },
      ...(siteUrl ? { emailRedirectTo: `${siteUrl}/auth/callback` } : {}),
    },
  });
  if (error) return { error: error.message };
  if (!data.session && data.user?.identities?.length === 0) {
    return { error: null, status: 'already_exists' };
  }
  return { error: null, status: data.session ? 'authenticated' : 'verification_required' };
}

export async function resolvePostAuthDestination(gymCode?: string): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Session confirmation failed: ${userError.message}`);
  if (!userData.user) return '/auth?mode=signin';
  return resolvePostAuthDestinationForSession(supabase, userData.user.id, gymCode);
}

export async function setActiveGymAction(gymId: string): Promise<{ role: GymUserRole }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('set_active_gym', { p_gym_id: gymId });
  if (error) throw new Error(error.message);
  revalidatePath('/admin'); revalidatePath('/member'); revalidatePath('/kiosk'); revalidatePath('/gyms');
  return { role: (data as { role: GymUserRole }).role };
}

export async function joinGymAction(gymId: string): Promise<{ status: GymUserStatus }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('join_gym', { p_gym_id: gymId });
  if (error) throw new Error(error.message);
  revalidatePath('/gyms');
  return { status: (data as { status: GymUserStatus }).status };
}

export async function verifyMembershipAction(gymId: string): Promise<{
  status: GymUserStatus;
  role: GymUserRole;
  matched: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('verify_gym_membership', { p_gym_id: gymId });
  if (error) throw new Error(error.message);
  const result = data as { status: GymUserStatus; role: GymUserRole; matched: boolean };
  revalidatePath('/gyms');
  return { status: result.status, role: result.role, matched: Boolean(result.matched) };
}

export async function saveGymAction(gymId: string, saved: boolean): Promise<{ saved: boolean }> {
  const supabase = await createServerSupabaseClient();
  const functionName = saved ? 'save_gym' : 'unsave_gym';
  const { data, error } = await supabase.rpc(functionName, { p_gym_id: gymId });
  if (error) throw new Error(error.message);
  revalidatePath('/gyms');
  return { saved: Boolean((data as { saved?: boolean } | null)?.saved) };
}

export async function sendVerificationReminderAction(gymId: string): Promise<{ nextReminderAt: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('send_membership_verification_reminder', { p_gym_id: gymId });
  if (error) throw new Error(error.message);
  revalidatePath('/gyms');
  return { nextReminderAt: String((data as { next_reminder_at: unknown }).next_reminder_at) };
}

export async function withdrawVerificationAction(gymId: string): Promise<{ withdrawn: boolean }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('withdraw_membership_verification', { p_gym_id: gymId });
  if (error) throw new Error(error.message);
  revalidatePath('/gyms');
  return { withdrawn: Boolean((data as { withdrawn?: boolean } | null)?.withdrawn) };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}
