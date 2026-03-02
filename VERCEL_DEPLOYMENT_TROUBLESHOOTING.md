# Vercel Deployment Troubleshooting

If builds succeed but deployment fails at "Deploying outputs" with "We encountered an internal error":

## Phase 1: Immediate Actions (No Code Changes)

1. **Retry deployment** – Trigger a new deployment from the Vercel dashboard or `git push`. Transient errors often resolve on retry.

2. **Check Vercel status** – Visit [status.vercel.com](https://status.vercel.com) for incidents.

3. **Verify plan limits** – Confirm the UpswitchEU team is on Pro (or higher). Hobby plan limits 12 serverless functions.

## Phase 2: Diagnostics

Add `VERCEL_ANALYZE_BUILD_OUTPUT=1` in Vercel Project Settings → Environment Variables (Production, Preview, Development). Redeploy and inspect build logs for:

- Uncompressed function sizes (MB)
- Largest contributors per function
- Any function approaching 250 MB limit

## Phase 3: Case Sensitivity Audit (macOS → Linux)

If deployments fail and you suspect import path case mismatches (macOS is case-insensitive, Vercel/Linux is strict):

```bash
# Make git case-sensitive locally to surface mismatches
git config core.ignorecase false

# Fix any import paths that don't match actual filenames exactly
```

## Phase 4: Escalation

If the issue persists after retries and mitigations:

- **Vercel Support** – Contact support with deployment URLs, timestamps, and logs.
- **Deployment region** – Try changing the build region in project settings (e.g. from `iad1` to another region).
