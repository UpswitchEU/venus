# @upswitch/ai-actions

Canonical cross-app contract for AI tool names, tool-result envelope types, and chat stream chunks.

Titan owns tool execution. Mercury and Venus own rendering and user interaction. This package is the boundary between them: if a conversational workflow can return a card, stream event, credit snapshot, or action envelope, its public shape belongs here.

Keep this package aligned with `tests/contracts/ai-tool-result-contract.json` and the `verify:ai-tool-result-contracts` gate.
