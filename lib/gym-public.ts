import { unstable_cache } from 'next/cache';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

export type GymPublicPayload = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  tagline: string | null;
  description: string | null;
  logo_path: string | null;
  logo_url: string | null;
  cover_path: string | null;
  cover_url: string | null;
  brand_color: string;
  secondary_color: string | null;
  operating_hours: Json | null;
  amenities: string[] | null;
  social_links: Json | null;
  team_members: Json | null;
  pricing_packages: Json | null;
  map_embed_url: string | null;
  directions: string | null;
  member_count: number;
  is_published: boolean;
  features: {
    public_team?: boolean;
    public_pricing?: boolean;
    public_location?: boolean;
  };
  cover_focal: Json;
  section_visibility: Json;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let publicSupabase: SupabaseClient<Database> | null = null;

function getPublicSupabase(): SupabaseClient<Database> {
  if (publicSupabase) return publicSupabase;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  publicSupabase = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return publicSupabase;
}

const fetchGymByCode = unstable_cache(
  async (code: string) => {
    const { data, error } = await getPublicSupabase().rpc('get_gym_by_code', { p_code: code });
    if (error) {
      throw new Error(`Failed to fetch gym by code: ${error.message}`);
    }
    return data;
  },
  ['gym-public-by-code'],
  { revalidate: 3600, tags: ['gym-public'] },
);

const fetchGymSecondaryColorByCode = unstable_cache(
  async (code: string): Promise<string | null> => {
    const { data: gymRow } = await getPublicSupabase()
      .from('gyms')
      .select('secondary_color')
      .eq('code', code)
      .maybeSingle();

    return gymRow?.secondary_color ?? null;
  },
  ['gym-public-secondary-by-code'],
  { revalidate: 3600, tags: ['gym-public'] },
);

export async function getGymPublicByCode(
  rawCode: string,
): Promise<{ code: string; data: GymPublicPayload | null }> {
  const code = normalizeGymCode(rawCode);
  const data = await fetchGymByCode(code);

  let secondaryColor: string | null = null;
  try {
    secondaryColor = await fetchGymSecondaryColorByCode(code);
  } catch {
    secondaryColor = null;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { code, data: null };
  }

  const payload = data as GymPublicPayload;

  return {
    code,
    data: {
      ...payload,
      secondary_color: typeof payload.secondary_color === 'string'
        ? payload.secondary_color
        : secondaryColor,
    },
  };
}

export function getGymAssetPublicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');

  const cleaned = path.trim().replace(/^\/+/, '');
  if (!cleaned) return null;

  const encodedPath = cleaned.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/public/gym-assets/${encodedPath}`;
}

function normalizeGymCode(rawCode: string): string {
  try {
    return decodeURIComponent(rawCode).trim();
  } catch {
    return rawCode.trim();
  }
}
