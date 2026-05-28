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
export declare function deriveClientScopedSessionKey(args: ClientScopedKeyArgs): string;
/** Workspace-scoped session for add-client / registry lookup turns. */
export declare function deriveAdvisorWorkspaceSessionKey(advisorUserId?: string | null, _pathname?: string | null): string;
export declare function isAdvisorWorkspaceSessionKey(sessionKey: string | undefined): boolean;
export declare function isAdvisorWorkspaceSurfaceIntent(surfaceIntent: unknown): surfaceIntent is AdvisorWorkspaceSurfaceIntent;
export declare function isAdvisorWorkspaceClientTurn(args: {
    surfaceIntent?: unknown;
    sessionId?: string | null;
}): boolean;
//# sourceMappingURL=conversation-keys.d.ts.map