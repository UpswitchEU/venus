/**
 * Cross-app AI conversation session keys.
 *
 * Byte-equality with Mercury/Venus/Titan is enforced by
 * `tests/contracts/ai-conversation-key-contract.json`.
 */

export type AdvisorWorkspaceSurfaceIntent = 'add_client' | 'kbo_lookup';

export interface ClientScopedKeyArgs {
	clientUserId?: string | null;
	advisorUserId?: string | null;
	pathname?: string | null;
}

/** Titan `session_id` / non-UUID `reportId` for a client-scoped advisor thread. */
export function deriveClientScopedSessionKey(
	args: ClientScopedKeyArgs
): string {
	const clientId =
		typeof args.clientUserId === 'string' && args.clientUserId.length > 0
			? args.clientUserId
			: null;
	if (clientId) {
		return `client_${clientId}`;
	}

	const advisorId =
		typeof args.advisorUserId === 'string' && args.advisorUserId.length > 0
			? args.advisorUserId
			: 'unknown';
	const slug =
		typeof args.pathname === 'string' && args.pathname.length > 0
			? args.pathname.replace(/\W+/g, '_')
			: 'unknown';
	return `advisor_${advisorId}_${slug}`;
}

/** Workspace-scoped session for add-client / registry lookup turns. */
export function deriveAdvisorWorkspaceSessionKey(
	advisorUserId?: string | null,
	_pathname?: string | null
): string {
	const advisorId =
		typeof advisorUserId === 'string' && advisorUserId.length > 0
			? advisorUserId
			: 'unknown';
	return `advisor_${advisorId}_workspace`;
}

export function isAdvisorWorkspaceSessionKey(
	sessionKey: string | undefined
): boolean {
	return (
		typeof sessionKey === 'string' &&
		/^advisor[-_][^/]+_workspace$/.test(sessionKey)
	);
}

export function isAdvisorWorkspaceSurfaceIntent(
	surfaceIntent: unknown
): surfaceIntent is AdvisorWorkspaceSurfaceIntent {
	return surfaceIntent === 'add_client' || surfaceIntent === 'kbo_lookup';
}

export function isAdvisorWorkspaceClientTurn(args: {
	surfaceIntent?: unknown;
	sessionId?: string | null;
}): boolean {
	return (
		isAdvisorWorkspaceSurfaceIntent(args.surfaceIntent) ||
		isAdvisorWorkspaceSessionKey(
			typeof args.sessionId === 'string' ? args.sessionId : undefined
		)
	);
}
