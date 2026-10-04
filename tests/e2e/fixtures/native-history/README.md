# Native report navigation regression

Run `node scripts/verify-native-history.mjs` from Venus with a Playwright browser installed.
Optional variables: `HISTORY_TEST_BROWSER` (`chromium`, `firefox`, `webkit`),
`HISTORY_TEST_EXECUTABLE` (installed browser path), and `HISTORY_TEST_PORT` (default 3033).

The runner copies this fixture into a temporary directory and starts the installed
Next.js version on loopback. It imports the real form synchronization, navigation
save boundary and history controller. Authentication, stores and report assets are
replaced with explicit test doubles. All saves go to an in-memory local endpoint;
the fixture does not load application environment files. Browser requests outside
the fixture origin are blocked. No production credentials or customer records are used.

Assertions cover edits immediately followed by Back/Forward, server acknowledgement
before departure, failed saves and Retry, repeated Back, multi-entry jumps, restored
inputs, routing errors and unchanged history length. These are routing/persistence
regressions; they do not measure production performance or verify the real backend.
