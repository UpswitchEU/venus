import { isValuationActiveWorkspacePath } from '@/components/calculator/advisorLifecycleWorkspace'
import { describe, expect, it } from 'vitest'

describe('isValuationActiveWorkspacePath', () => {
	it('is true for calculator routes', () => {
		expect(isValuationActiveWorkspacePath('/en/calculator')).toBe(true)
		expect(isValuationActiveWorkspacePath('/nl/calculator/session-foo')).toBe(true)
	})

	it('is true for report routes', () => {
		expect(isValuationActiveWorkspacePath('/en/reports')).toBe(true)
		expect(isValuationActiveWorkspacePath('/en/reports/new')).toBe(true)
		expect(isValuationActiveWorkspacePath('/nl/reports/550e8400-e29b-41d4-a716-446655440000')).toBe(
			true
		)
	})

	it('is false outside valuation surfaces', () => {
		expect(isValuationActiveWorkspacePath('/en')).toBe(false)
		expect(isValuationActiveWorkspacePath('/en/settings')).toBe(false)
		expect(isValuationActiveWorkspacePath('')).toBe(false)
	})

	it('does not match lookalike path segments (hyphen suffix)', () => {
		expect(isValuationActiveWorkspacePath('/en/reports-archive')).toBe(false)
		expect(isValuationActiveWorkspacePath('/en/calculator-legacy')).toBe(false)
	})

	it('treats null/undefined like empty', () => {
		expect(isValuationActiveWorkspacePath(null)).toBe(false)
		expect(isValuationActiveWorkspacePath(undefined)).toBe(false)
	})
})
