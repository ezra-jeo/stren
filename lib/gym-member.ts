import { unstable_cache } from 'next/cache';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let publicSupabase: SupabaseClient<Database> | null = null;

function getPublicSupabase(): SupabaseClient<Database> {
  if (publicSupabase) return publicSupabase;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  publicSupabase = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return publicSupabase;
}

export type GymBranding = {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  brand_color: string;
  secondary_color: string | null;
};

const fetchGymBrandingById = unstable_cache(
  async (gymId: string): Promise<GymBranding | null> => {
    const { data, error } = await getPublicSupabase()
      .from('gyms')
      .select('id, name, code, logo_url, logo_path, brand_color, secondary_color')
      .eq('id', gymId)
      .maybeSingle();

    if (error || !data) return null;

    let logo_url = data.logo_url;
    if (data.logo_path) {
      if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');
      const cleaned = data.logo_path.trim().replace(/^\/+/, '');
      logo_url = `${supabaseUrl}/storage/v1/object/public/gym-assets/${cleaned.split('/').map(encodeURIComponent).join('/')}`;
    }

    return {
      id: data.id,
      name: data.name,
      code: data.code,
      logo_url,
      brand_color: data.brand_color ?? '#D4956A',
      secondary_color: data.secondary_color ?? null,
    };
  },
  ['gym-branding-by-id'],
  { revalidate: 86400, tags: ['gym-branding'] },
);

export async function getGymBrandingById(gymId: string): Promise<GymBranding | null> {
  return fetchGymBrandingById(gymId);
}
