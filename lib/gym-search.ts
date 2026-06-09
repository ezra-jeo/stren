import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type GymSearchResult = {
  id: string;
  name: string;
  code: string;
  address: string | null;
};

export async function searchGymsWithFallback(
  supabase: SupabaseClient<Database>,
  query: string,
  limit = 5,
): Promise<GymSearchResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  const { data, error } = await supabase.rpc('search_gyms', { p_query: trimmed });
  if (!error && data && data.length > 0) {
    return (data as GymSearchResult[]).slice(0, limit);
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from('gyms')
    .select('id, name, code, address')
    .or(`name.ilike.%${trimmed}%,code.ilike.%${trimmed}%`)
    .order('name', { ascending: true })
    .limit(10);

  if (fallbackError) {
    return [];
  }

  return ((fallbackData ?? []) as GymSearchResult[]).slice(0, limit);
}