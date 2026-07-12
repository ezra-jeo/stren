export function validateAccountSignup(input: { name: string; email: string; password: string }): string | null {
  if (input.name.trim().length < 2) return 'Enter your full name.';
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) return 'Enter a valid email address.';
  if (input.password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function mapCreateGymError(message: string): string {
  const value = message.toLowerCase();
  if (value.includes('reserved')) return 'That gym code is reserved. Try another one.';
  if (value.includes('already taken') || value.includes('duplicate')) return 'That gym code is already taken.';
  if (value.includes('publish one') || value.includes('creating another')) return 'Publish one of your gyms before creating another.';
  if (value.includes('3-32') || value.includes('gym code')) return 'Use 3–32 lowercase letters, numbers, or hyphens for the gym code.';
  return message;
}
