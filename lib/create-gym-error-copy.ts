/**
 * Plain-language copy for `create_gym` guard failures on `/gyms/new`
 * (§2.5 owner path, §6.1 create_gym errors).
 *
 * The RPC already raises owner-friendly messages, but Supabase can wrap or
 * prefix them, so we normalise the four guard cases (reserved · taken · invalid
 * format · unpublished cap) to guaranteed-clean copy and pass anything else
 * through untouched.
 */

export function readableCreateGymError(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  const lower = value.toLowerCase();

  if (lower.includes('reserved')) {
    return "That gym code is reserved — please pick a different one.";
  }
  if (lower.includes('already taken') || lower.includes('already in use') || lower.includes('duplicate')) {
    return 'That gym code is already taken — please pick a different one.';
  }
  if (lower.includes('code must be')) {
    return 'The gym code can use 3–32 lowercase letters, numbers, and single hyphens (like "iron-house").';
  }
  if (lower.includes('name must be')) {
    return 'The gym name should be between 2 and 120 characters.';
  }
  if (lower.includes('publish one of your gyms')) {
    return 'You can set up 3 gyms at a time. Publish one of your gyms before creating another.';
  }
  if (lower.includes('authentication required')) {
    return 'Please sign in again, then create your gym.';
  }

  return value || 'We could not create your gym. Please check the details and try again.';
}
