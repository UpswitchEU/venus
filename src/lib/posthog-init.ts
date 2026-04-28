/**
 * PostHog client for Venus. Mirrors Mercury's posthog-init.ts pattern.
 *
 * Set NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN (or legacy NEXT_PUBLIC_POSTHOG_KEY).
 * Events mirror analytics.ts — opt-out by default until cookie consent.
 */
import posthog from 'posthog-js';

import { getPostHogApiHost, getPostHogProjectToken } from './posthog-env';

export { getPostHogApiHost, getPostHogProjectToken } from './posthog-env';

const MAX_QUEUE = 50;

type QueuedCapture = {
	name: string;
	params?: Record<string, string | number | boolean>;
};

let initialized = false;
let preInitQueue: QueuedCapture[] = [];
let queue: QueuedCapture[] = [];
let pendingIdentify: { userId: string; role?: string } | null = null;

function mergePreInitIntoOptOutQueue(): void {
	for (const q of preInitQueue) {
		if (queue.length >= MAX_QUEUE) queue.shift();
		queue.push(q);
	}
	preInitQueue = [];
}

export function initVenusPostHog(): void {
	if (typeof window === 'undefined') return;
	const key = getPostHogProjectToken();
	if (!key || initialized) return;
	const host = getPostHogApiHost();
	const onUpswitch = window.location.hostname.endsWith('upswitch.app');
	try {
		posthog.init(key, {
			api_host: host,
			defaults: '2026-01-30',
			opt_out_capturing_by_default: true,
			person_profiles: 'identified_only',
			persistence: 'localStorage+cookie',
			autocapture: false,
			capture_pageview: false,
			disable_session_recording: true,
			...(onUpswitch
				? {
						cross_subdomain_cookie: true,
						cookie_domain: '.upswitch.app',
					}
				: {}),
		});
		initialized = true;
		mergePreInitIntoOptOutQueue();
	} catch (e) {
		preInitQueue = [];
		if (process.env.NODE_ENV === 'development') {
			console.warn('[Venus] PostHog init failed', e);
		}
	}
}

export function syncPostHogConsent(analyticsEnabled: boolean): void {
	if (!getPostHogProjectToken() || !initialized) return;
	if (analyticsEnabled) {
		try { posthog.opt_in_capturing(); } catch { /* ignore */ }
		flushPostHogAfterOptIn();
	} else {
		try { posthog.opt_out_capturing(); } catch { /* ignore */ }
		try { posthog.reset(); } catch { /* ignore */ }
		queue = [];
		preInitQueue = [];
		pendingIdentify = null;
	}
}

function flushPostHogAfterOptIn(): void {
	if (!initialized || !isPostHogCaptureAllowed()) return;
	if (pendingIdentify) {
		try {
			posthog.identify(
				pendingIdentify.userId,
				pendingIdentify.role ? { user_role: pendingIdentify.role } : undefined
			);
		} catch { /* ignore */ }
		pendingIdentify = null;
	}
	const batch = queue;
	queue = [];
	for (const q of batch) {
		try { posthog.capture(q.name, q.params); } catch { /* ignore */ }
	}
}

export function isPostHogCaptureAllowed(): boolean {
	if (!initialized || !getPostHogProjectToken() || typeof window === 'undefined') {
		return false;
	}
	try {
		const ph = posthog as { has_opted_out_capturing?: () => boolean };
		if (typeof ph.has_opted_out_capturing !== 'function') return true;
		return !ph.has_opted_out_capturing();
	} catch {
		return true;
	}
}

export function capturePostHogOrQueue(
	name: string,
	params?: Record<string, string | number | boolean>
): void {
	if (!getPostHogProjectToken() || typeof window === 'undefined') return;
	if (!initialized) {
		if (preInitQueue.length >= MAX_QUEUE) preInitQueue.shift();
		preInitQueue.push({ name, params });
		return;
	}
	if (isPostHogCaptureAllowed()) {
		try { posthog.capture(name, params); } catch { /* never block UI */ }
		return;
	}
	if (queue.length >= MAX_QUEUE) queue.shift();
	queue.push({ name, params });
}

export function identifyPostHogOrQueue(userId: string, role?: string): void {
	if (!getPostHogProjectToken() || typeof window === 'undefined') return;
	if (!initialized) {
		pendingIdentify = { userId, role };
		return;
	}
	if (isPostHogCaptureAllowed()) {
		try {
			posthog.identify(userId, role ? { user_role: role } : undefined);
		} catch { /* ignore */ }
		pendingIdentify = null;
	} else {
		pendingIdentify = { userId, role };
	}
}

export function clearPostHogClientState(): void {
	queue = [];
	preInitQueue = [];
	pendingIdentify = null;
	if (!getPostHogProjectToken() || typeof window === 'undefined') return;
	try { posthog.reset(); } catch { /* ignore */ }
}

export { posthog };
