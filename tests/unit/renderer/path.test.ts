import { describe, expect, it } from 'vitest'
import { getLastPathSegment } from '../../../src/renderer/src/utils/path'

describe('getLastPathSegment', () => {
  it('handles Windows paths', () => {
    expect(getLastPathSegment('C:\\work\\project')).toBe('project')
    expect(getLastPathSegment('C:\\work\\project\\')).toBe('project')
  })

  it('handles POSIX paths', () => {
    expect(getLastPathSegment('/home/user/repo')).toBe('repo')
    expect(getLastPathSegment('/home/user/repo/')).toBe('repo')
  })

  it('returns empty string for root-like inputs', () => {
    expect(getLastPathSegment('')).toBe('')
    expect(getLastPathSegment('/')).toBe('')
    expect(getLastPathSegment('C:\\')).toBe('C:')
  })
})

