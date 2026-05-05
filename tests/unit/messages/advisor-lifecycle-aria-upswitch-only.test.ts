/**
 * Client-facing copy must not name internal app codenames (Upswitch-only UX).
 */
import en from '../../../messages/en.json';
import nl from '../../../messages/nl.json';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = /\b(mercury|venus)\b/i;

type CalculatorMessages = {
	calculator?: {
		advisorLifecycle?: { ariaLabel?: string; basis?: string };
	};
};

describe('calculator.advisorLifecycle.ariaLabel (client-facing)', () => {
	it('does not mention Mercury or Venus in EN or NL', () => {
		const enLabel = (en as CalculatorMessages).calculator?.advisorLifecycle
			?.ariaLabel;
		const nlLabel = (nl as CalculatorMessages).calculator?.advisorLifecycle
			?.ariaLabel;
		expect(typeof enLabel).toBe('string');
		expect(enLabel!.length).toBeGreaterThan(0);
		expect(enLabel).not.toMatch(FORBIDDEN);
		expect(typeof nlLabel).toBe('string');
		expect(nlLabel!.length).toBeGreaterThan(0);
		expect(nlLabel).not.toMatch(FORBIDDEN);
	});

	it('mentions Upswitch for screen-reader context', () => {
		const enLabel = (en as CalculatorMessages).calculator?.advisorLifecycle
			?.ariaLabel;
		const nlLabel = (nl as CalculatorMessages).calculator?.advisorLifecycle
			?.ariaLabel;
		expect(enLabel!.toLowerCase()).toContain('upswitch');
		expect(nlLabel!.toLowerCase()).toContain('upswitch');
	});

	it('EN basis label matches dossier Basic (not Dutch Basis)', () => {
		const basis = (en as CalculatorMessages).calculator?.advisorLifecycle?.basis;
		expect(basis).toBe('Basic');
	});
});
