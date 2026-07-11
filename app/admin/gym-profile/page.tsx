import { GymPageStudio } from '@/components/admin/gym-studio/GymPageStudio';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requirePermission } from '@/lib/permissions-server';

// Re-skinned to the Gym Page Studio (ImplementationPlan.md §7). All state + the
// upload/compress/hash/cleanup/save/revalidate pipeline live in <GymPageStudio/>,
// lifted verbatim from the old form. This stays a client page for now; Agent B
// converts it to a server wrapper (guard + fetch + props) after this merges.
export default async function GymProfilePage() {
  const access = await requirePermission('gym_page:view');
  const supabase = await createServerSupabaseClient();

  const { data: initialGym } = access.gymId
    ? await supabase
        .from('gyms')
        .select(
          'id, name, code, is_published, tagline, description, brand_color, secondary_color, logo_url, cover_url, logo_path, cover_path, address, phone, operating_hours, amenities, social_links, team_members, pricing_packages, map_embed_url, directions, cover_focal, section_visibility',
        )
        .eq('id', access.gymId)
        .maybeSingle()
    : { data: null };

  return (
    <GymPageStudio
      initialGym={initialGym}
      access={access}
      initialFeatureFlags={access.features}
    />
  );
}
