import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import handler from '../health'
import { createClient } from '@supabase/supabase-js'

type MockRes = NextApiResponse & { _status: number; _json: unknown }

function makeMockRes(): MockRes {
  const res = {} as MockRes
  res.status = vi.fn().mockImplementation((code: number) => {
    res._status = code
    return res
  }) as unknown as NextApiResponse['status']
  res.json = vi.fn().mockImplementation((body: unknown) => {
    res._json = body
  }) as unknown as NextApiResponse['json']
  return res
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with features array on success', async () => {
    const features = [
      { id: 'abc', title: 'Feature A', status: 'created', updated_at: '2026-01-01T00:00:00Z' },
    ]
    ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: features, error: null }),
        }),
      }),
    })

    const req = {} as NextApiRequest
    const res = makeMockRes()

    await handler(req, res)

    expect(res._status).toBe(200)
    expect(res._json).toEqual(features)
  })

  it('returns 500 with error message on database error', async () => {
    ;(createClient as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: null, error: { message: 'connection refused' } }),
        }),
      }),
    })

    const req = {} as NextApiRequest
    const res = makeMockRes()

    await handler(req, res)

    expect(res._status).toBe(500)
    expect(res._json).toEqual({ error: 'connection refused' })
  })
})
