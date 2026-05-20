import { afterEach, describe, expect, it } from 'vitest'
import { getTitanApiUrl } from './getTitanApiUrl'

function requestForHost(host: string): Request {
  return new Request(`https://${host}/api/test`, {
    headers: { host },
  })
}

const ORIGINAL_ENV = {
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
}

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = ORIGINAL_ENV.NEXT_PUBLIC_BACKEND_URL
  process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL_ENV.NEXT_PUBLIC_API_BASE_URL
})

describe('getTitanApiUrl', () => {
  it('uses local Titan for localhost Venus requests when no explicit env is set', () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL
    delete process.env.NEXT_PUBLIC_API_BASE_URL

    expect(getTitanApiUrl(requestForHost('localhost:3001'))).toBe('http://localhost:3002')
    expect(getTitanApiUrl(requestForHost('127.0.0.1:3001'))).toBe('http://localhost:3002')
  })

  it('keeps explicit env URLs ahead of host inference', () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://custom-api.example.com/'
    delete process.env.NEXT_PUBLIC_API_BASE_URL

    expect(getTitanApiUrl(requestForHost('localhost:3001'))).toBe('https://custom-api.example.com')
  })

  it('uses staging for preview and staging hosts', () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL
    delete process.env.NEXT_PUBLIC_API_BASE_URL

    expect(getTitanApiUrl(requestForHost('preview.upswitch.app'))).toBe(
      'https://api-staging.upswitch.app'
    )
    expect(getTitanApiUrl(requestForHost('staging.upswitch.app'))).toBe(
      'https://api-staging.upswitch.app'
    )
  })
})
