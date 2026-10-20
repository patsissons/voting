import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs info messages with a timestamp prefix', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    logger.info('hello', { detail: 1 })
    expect(spy).toHaveBeenCalledTimes(1)
    const [message, extra] = spy.mock.calls[0]!
    expect(message).toMatch(/^\[\d{4}-\d{2}-\d{2}T.*\] hello$/)
    expect(extra).toEqual({ detail: 1 })
  })

  it('logs errors via console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('boom')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
