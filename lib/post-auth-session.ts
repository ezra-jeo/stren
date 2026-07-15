import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { choosePostAuthDestination } from './post-auth-destination';
import type { GymUserRole, GymUserStatus, MyGym } from './types';

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

export async function resolvePostAuthDestinationForSession(
  supabase: SupabaseClient<Database>,
  expectedUserId: string,
  gymCode?: string,
): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user || userData.user.id !== expectedUserId) {
    throw new Error('The authenticated callback session did not match the verified account.');
  }

  const [{ data: rows, error: gymsError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.rpc('get_my_gyms'),
    supabase.from('profiles').select('active_gym_id').eq('id', expectedUserId).maybeSingle(),
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
