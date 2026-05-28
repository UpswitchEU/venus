import { describe, expect, it } from 'vitest';
import {
	bootstrapTitanCallTimeoutMs,
	remainingBootstrapRouteBudgetMs,
	VENUS_BOOTSTRAP_ROUTE_BUDGET_MS,
} from '@/lib/bootstrap/bootstrapProxyTimeouts';

describe('bootstrap route timeout budget', () => {
	it('never schedules a Titan call longer than remaining route budget', () => {
		const start = 1_000;
		const late = start + VENUS_BOOTSTRAP_ROUTE_BUDGET_MS - 500;
		expect(bootstrapTitanCallTimeoutMs(start, late)).toBe(1_000);
	});

	it('returns at least 1s remaining budget for refresh retry tail', () => {
		const start = 0;
		const spent = VENUS_BOOTSTRAP_ROUTE_BUDGET_MS - 1;
		expect(remainingBootstrapRouteBudgetMs(start, spent)).toBe(1_000);
	});
});
