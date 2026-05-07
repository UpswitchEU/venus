import { describe, expect, it } from 'vitest'
import {
	MERCURY_SITE_WWW_CANONICAL,
	tryNormalizeApiBaseUrl,
	tryNormalizeToOrigin,
} from './normalizeExplicitUrl'

describe('tryNormalizeToOrigin', () => {
	it('returns null for empty', () => {
		expect(tryNormalizeToOrigin('')).toBeNull()
		expect(tryNormalizeToOrigin('  ')).toBeNull()
	})

	it('adds https for host-only Mercury env', () => {
		expect(tryNormalizeToOrigin('www.upswitch.app')).toBe(MERCURY_SITE_WWW_CANONICAL)
	})

	it('uses http for schemeless loopback', () => {
		expect(tryNormalizeToOrigin('localhost:3000')).toBe('http://localhost:3000')
	})

	it('strips path — parent base is origin only', () => {
		expect(tryNormalizeToOrigin('https://mercury.test/nl/foo')).toBe('https://mercury.test')
	})
})

describe('tryNormalizeApiBaseUrl', () => {
	it('preserves single path segment', () => {
		expect(tryNormalizeApiBaseUrl('https://api.test/v2/')).toBe('https://api.test/v2')
	})
})
