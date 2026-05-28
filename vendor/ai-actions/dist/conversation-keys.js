/**
 * Cross-app AI conversation session keys.
 *
 * Byte-equality with Mercury/Venus/Titan is enforced by
 * `tests/contracts/ai-conversation-key-contract.json`.
 */
/** Titan `session_id` / non-UUID `reportId` for a client-scoped advisor thread. */
export function deriveClientScopedSessionKey(args) {
    const clientId = typeof args.clientUserId === 'string' && args.clientUserId.length > 0
        ? args.clientUserId
        : null;
    if (clientId) {
        return `client_${clientId}`;
    }
    const advisorId = typeof args.advisorUserId === 'string' && args.advisorUserId.length > 0
        ? args.advisorUserId
        : 'unknown';
    const slug = typeof args.pathname === 'string' && args.pathname.length > 0
        ? args.pathname.replace(/\W+/g, '_')
        : 'unknown';
    return `advisor_${advisorId}_${slug}`;
}
/** Workspace-scoped session for add-client / registry lookup turns. */
export function deriveAdvisorWorkspaceSessionKey(advisorUserId, _pathname) {
    const advisorId = typeof advisorUserId === 'string' && advisorUserId.length > 0
        ? advisorUserId
        : 'unknown';
    return `advisor_${advisorId}_workspace`;
}
export function isAdvisorWorkspaceSessionKey(sessionKey) {
    return (typeof sessionKey === 'string' &&
        /^advisor[-_][^/]+_workspace$/.test(sessionKey));
}
export function isAdvisorWorkspaceSurfaceIntent(surfaceIntent) {
    return surfaceIntent === 'add_client' || surfaceIntent === 'kbo_lookup';
}
export function isAdvisorWorkspaceClientTurn(args) {
    return (isAdvisorWorkspaceSurfaceIntent(args.surfaceIntent) ||
        isAdvisorWorkspaceSessionKey(typeof args.sessionId === 'string' ? args.sessionId : undefined));
}
//# sourceMappingURL=conversation-keys.js.map