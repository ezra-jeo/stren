export function validateAccountSignup(input: { name: string; email: string; password: string }): string | null {
  if (input.name.trim().length < 2) return 'Enter your full name.';
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) return 'Enter a valid email address.';
  if (input.password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}
