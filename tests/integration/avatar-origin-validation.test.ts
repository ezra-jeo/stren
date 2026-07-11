import { describe, expect, it } from 'vitest';
import { isAllowedSupabaseStorageUrl } from '@/app/api/member/avatar/route';

describe('member avatar URL validation', () => {
  it('accepts only URLs from the configured Supabase storage origin', () => {
    const supabaseUrl = 'https://project.supabase.co';

    expect(
      isAllowedSupabaseStorageUrl(
        'https://project.supabase.co/storage/v1/object/public/member-avatars/avatars/user/a.jpg',
        supabaseUrl,
      ),
    ).toBe(true);
    expect(
      isAllowedSupabaseStorageUrl(
        'https://project.supabase.co/storage/v1/object/sign/member-avatars/avatars/user/a.jpg?token=x',
        supabaseUrl,
      ),
    ).toBe(true);

    expect(isAllowedSupabaseStorageUrl('https://evil.test/a.jpg', supabaseUrl)).toBe(false);
    expect(isAllowedSupabaseStorageUrl('https://project.supabase.co.evil.test/a.jpg', supabaseUrl)).toBe(false);
    expect(isAllowedSupabaseStorageUrl('https://user:pass@project.supabase.co/storage/v1/object/public/a.jpg', supabaseUrl)).toBe(false);
    expect(isAllowedSupabaseStorageUrl('https://project.supabase.co/auth/v1/a.jpg', supabaseUrl)).toBe(false);
    expect(isAllowedSupabaseStorageUrl('javascript:alert(1)', supabaseUrl)).toBe(false);
  });
});
