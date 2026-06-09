import { describe, it, expect } from 'vitest'
import { isValidLoginOrigin } from '@/lib/login-origin'

describe('login-origin helper', () => {
  it('accepts root login', () => {
    expect(isValidLoginOrigin('/login')).toBe(true)
  })

  it('accepts gym login without source', () => {
    expect(isValidLoginOrigin('/gym/alpha/login')).toBe(true)
  })

  it('accepts gym login with from=select', () => {
    expect(isValidLoginOrigin('/gym/alpha/login?from=select')).toBe(true)
  })

  it('accepts gym login with from=landing', () => {
    expect(isValidLoginOrigin('/gym/alpha/login?from=landing')).toBe(true)
  })

  it('rejects unknown from value', () => {
    expect(isValidLoginOrigin('/gym/alpha/login?from=weird')).toBe(false)
  })

  it('rejects extra query params', () => {
    expect(isValidLoginOrigin('/gym/alpha/login?from=select&x=1')).toBe(false)
  })

  it('rejects non-gym paths', () => {
    expect(isValidLoginOrigin('/other/path')).toBe(false)
  })

})
