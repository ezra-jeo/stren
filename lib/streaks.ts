import { createClient } from './supabase';
import { bestWeeklyStreak, weeklyStreak } from './member-weekly-streak';

const supabase = createClient();

type StreakResult = { currentStreak: number; bestStreak: number; isNewBest: boolean };

/**
 * Legacy client engagement helper. The kiosk is the source of truth, but this
 * path keeps any client-side engagement hook on the same weekly contract.
 */
export async function updateStreak(memberId: string, gymId: string | null): Promise<StreakResult> {
  if (!gymId) return { currentStreak: 0, bestStreak: 0, isNewBest: false };

  const [{ data: streak }, { data: attendance }] = await Promise.all([
    supabase.from('streaks').select('*').eq('member_id', memberId).eq('gym_id', gymId).maybeSingle(),
    supabase.from('attendance').select('check_in').eq('member_id', memberId).eq('gym_id', gymId),
  ]);
  const visits = (attendance ?? []).flatMap((visit) => visit.check_in ? [visit.check_in] : []);
  const currentStreak = weeklyStreak(visits);
  const bestStreak = bestWeeklyStreak(visits);
  const isNewBest = bestStreak > (streak?.best_streak ?? 0);

  await supabase.from('streaks').upsert({
    member_id: memberId,
    gym_id: gymId,
    current_streak: currentStreak,
    best_streak: bestStreak,
    last_visit_date: new Date().toISOString().slice(0, 10),
  }, { onConflict: 'member_id,gym_id' });

  return { currentStreak, bestStreak, isNewBest };
}

export async function getStreak(memberId: string, gymId?: string | null) {
  let query = supabase.from('streaks').select('*').eq('member_id', memberId);
  if (gymId) query = query.eq('gym_id', gymId);
  const { data } = await query.maybeSingle();
  return data
    ? { currentStreak: data.current_streak ?? 0, bestStreak: data.best_streak ?? 0, lastVisitDate: data.last_visit_date }
    : { currentStreak: 0, bestStreak: 0, lastVisitDate: null };
}
