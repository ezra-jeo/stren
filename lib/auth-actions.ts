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

  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase.rpc('get_my_gyms'),
    supabase.from('profiles').select('active_gym_id').eq('id', userData.user.id).maybeSingle(),
  ]);
  const gyms = Array.isArray(rows) ? rows.map((row) => toMyGym(row as Record<string, unknown>)) : [];
  const destination = choosePostAuthDestination(gyms, profile?.active_gym_id ?? null, gymCode);
  if (destination.activateGymId) {
    await supabase.rpc('set_active_gym', { p_gym_id: destination.activateGymId });
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

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}
