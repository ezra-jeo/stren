import { describe, expect, it } from 'vitest'
import { resolveSignOutTargetPath } from '@/lib/sign-out-routing'

describe('sign-out routing', () => {
  it('prefers stored login origin', () => {
    expect(
      resolveSignOutTargetPath({
        storedLoginOriginPath: '/gym/alpha/login?from=select',
        gymLoginPath: '/gym/alpha/login',
      }),
    ).toBe('/gym/alpha/login?from=select')
  })

  it('falls back to gym login for admins and members', () => {
    expect(
      resolveSignOutTargetPath({
        storedLoginOriginPath: null,
        gymLoginPath: '/gym/alpha/login',
      }),
    ).toBe('/gym/alpha/login')
  })

  it('falls back to global login when no gym is available', () => {
    expect(
      resolveSignOutTargetPath({
        storedLoginOriginPath: null,
        gymLoginPath: null,
      }),
    ).toBe('/login')
  })
})
