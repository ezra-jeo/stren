/**
 * Calendar-week consistency helpers shared by member UI tests and server data
 * contracts. Weeks start Monday. A member needs one qualifying check-in during
 * a week; the still-open current week is a grace period, not a missed week.
 */
function localDateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

function mondayKey(value: Date, timeZone: string) {
  const { year, month, day } = localDateParts(value, timeZone);
  const localAsUtc = new Date(Date.UTC(year, month - 1, day));
  const mondayOffset = (localAsUtc.getUTCDay() + 6) % 7;
  localAsUtc.setUTCDate(localAsUtc.getUTCDate() - mondayOffset);
  return localAsUtc.toISOString().slice(0, 10);
}

function priorWeek(key: string) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

export function completedWeekKeys(visits: string[], timeZone: string) {
  return [...new Set(visits.map((visit) => mondayKey(new Date(visit), timeZone)))].sort();
}

export function trainedThisWeek(visits: string[], now = new Date(), timeZone = 'Asia/Manila') {
  return completedWeekKeys(visits, timeZone).includes(mondayKey(now, timeZone));
}

export function weeklyStreak(visits: string[], now = new Date(), timeZone = 'Asia/Manila') {
  const completed = new Set(completedWeekKeys(visits, timeZone));
  let cursor = mondayKey(now, timeZone);

  // An empty, in-progress week must not erase a member's consistency streak.
  if (!completed.has(cursor)) cursor = priorWeek(cursor);

  let streak = 0;
  while (completed.has(cursor)) {
    streak += 1;
    cursor = priorWeek(cursor);
  }
  return streak;
}

export function bestWeeklyStreak(visits: string[], timeZone = 'Asia/Manila') {
  const completed = completedWeekKeys(visits, timeZone);
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const week of completed) {
    run = previous === null || priorWeek(week) !== previous ? 1 : run + 1;
    best = Math.max(best, run);
    previous = week;
  }
  return best;
}
