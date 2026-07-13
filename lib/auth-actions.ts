'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createServerSupabaseClient } from './supabase-server';
import { choosePostAuthDestination } from './post-auth-destination';
import type { GymUserRole, GymUserStatus, MyGym } from './types';
import { validateAccountSignup } from './auth-action-validation';

function toMyGym(row: Record<string, unknown>): MyGym {
  return {
    gymId: String(row.gym_id),
    code: String(row.code),
    name: String(row.name),
    logoUrl: typeof row.logo_url === 'string' ? row.logo_url : null,
    role: row.role as GymUserRole,
    status: row.status as GymUserStatus,
  };
}

export async function signUpAccount(input: {
  name: string;
  email: string;
  password: string;
}): Promise<
  | { error: string; status?: never }
  | { error: null; status: 'authenticated' | 'verification_required' }
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
  return { error: null, status: data.session ? 'authenticated' : 'verification_required' };
}

export async function resolvePostAuthDestination(gymCode?: string): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return '/auth?mode=signin';

  const [{ data: rows, error: gymsError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.rpc('get_my_gyms'),
    supabase.from('profiles').select('active_gym_id').eq('id', userData.user.id).maybeSingle(),
  ]);
  if (gymsError) throw new Error(`Gym access lookup failed: ${gymsError.message}`);
  if (profileError) throw new Error(`Account profile lookup failed: ${profileError.message}`);
  const gyms = Array.isArray(rows) ? rows.map((row) => toMyGym(row as Record<string, unknown>)) : [];
  const destination = choosePostAuthDestination(gyms, profile?.active_gym_id ?? null, gymCode);
  if (destination.activateGymId) {
    const { error } = await supabase.rpc('set_active_gym', { p_gym_id: destination.activateGymId });
    if (error) throw new Error(`Active gym selection failed: ${error.message}`);
  }
  return destination.path;
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
