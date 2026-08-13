# Company graph context v3 — Venus compatibility boundary

Status: **shadow-only**

Venus does not calculate company knowledge-graph maturity. It may receive an optional
`company_graph_context` from an authenticated Titan owner/advisor projection and transport that
context unchanged with valuation, report, and session requests.

```ts
type CompanyGraphContext = {
  company_node_id: string // canonical Titan UUID
  graph_revision: string // exactly 64 lowercase hexadecimal characters; no algorithm prefix
  maturity_snapshot_id: string // immutable maturity snapshot UUID
  ruleset_version: string
  audience: 'owner' | 'advisor'
}
```

The contract is strict: optional means the key is omitted; `null`, extra fields, public/buyer
audiences, non-UUID identifiers, uppercase or prefixed revision digests, and non-content-addressed
revisions are rejected. The legacy
URL-token Business Card endpoint is an
identity prefill only and explicitly strips this context. A card name, slug, client ID, workspace
ID, ownership claim, or local UI state can never create graph authority.

Venus validation proves wire shape, not authority. Before this field can become active, Titan must
validate on every valuation, report, and session write that:

- the canonical node still resolves to the same survivor;
- the maturity snapshot is the current governing head;
- graph revision and ruleset exactly match that head;
- the caller has a current owner or advisor relationship matching `audience`; and
- expiry, revocation, consolidation, or authority loss has not invalidated the context.

Until those checks are live, all context handling in Venus is compatibility plumbing only and must
not change maturity, valuation confidence, disclosure, marketplace access, or customer-visible UI.
