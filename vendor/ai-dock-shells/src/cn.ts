import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The canonical `cn` helper for the ai-dock-shell package.
 *
 * Vendored from Mercury's `apps/mercury/lib/utils.ts` so the shells stay
 * self-contained. Both Mercury and Venus already depend on `clsx` +
 * `tailwind-merge` so there's no new dep surface — the package's
 * `peerDependencies` just hoist those two so the same instance is reused.
 *
 * Re-exported from the package barrel so consumers that already wrap their
 * own className composition can call ours directly without importing
 * twice.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
