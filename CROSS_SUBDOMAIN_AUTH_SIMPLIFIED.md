# Cross-Subdomain Authentication - Simplified (Stripe/Airbnb Approach)

## Philosophy

**Less is more.** Cookies are shared automatically via `.upswitch.app` domain. We don't need 10 detection methods - we need the right ones.

## What Top Platforms Actually Do

### Stripe/Airbnb Approach:
1. **BroadcastChannel/postMessage** - Same-origin tab communication (immediate, efficient)
2. **Visibility Change** - Background tab detection (checks on next API call)

That's it. No periodic polling, no navigation checks, no focus events, no online events, no storage events.

## Why This Works

### Cookies Are Shared Automatically
- Browser sends cookies with `.upswitch.app` domain automatically
- When Mercury logs out → cookies cleared → Venus detects on next API call
- No need to constantly check

### BroadcastChannel Is More Efficient
- Faster than postMessage for same-origin tabs
- Uses less resources
- Falls back to postMessage for compatibility

### Visibility Change Is Sufficient
- Only checks when tab becomes visible
- Catches background tabs when user switches back
- Cookies are shared automatically, so next API call detects changes
- No need for periodic polling

### Storage Events Don't Work Cross-Subdomain
- Storage events only work for same-origin tabs
- Cross-subdomain (Mercury → Venus) won't trigger storage events
- Cookies are shared automatically, so we don't need them

## Implementation

### Detection Methods (2 total):

1. **BroadcastChannel/postMessage** (`listenForLogout`, `listenForLogin`)
   - Same-origin tabs only
   - Immediate sync
   - Efficient (BroadcastChannel)
   - Secure (same origin check)
   - Falls back to postMessage for compatibility

2. **Visibility Change** (`setupAuthStateWatcher`)
   - Background tab detection
   - Only when tab becomes visible
   - Cookies are shared automatically, so next API call detects changes

### Removed (Overkill):
- ❌ Periodic polling (every 15s)
- ❌ Navigation checks (on route change)
- ❌ Focus events (on window focus)
- ❌ Online events (on network reconnect)
- ❌ Storage events (don't work cross-subdomain)
- ❌ Multiple watchers

## Race Condition Prevention

**Core Solution:** Promise cache in `checkSession()`

```typescript
let checkSessionPromise: Promise<User | null> | null = null

checkSession: async () => {
  if (checkSessionPromise) {
    return checkSessionPromise  // All concurrent calls get same promise
  }
  // ... create promise ...
}
```

**Result:** Multiple detection methods = Single API call (automatic)

## Benefits

1. **Simpler** - 3 methods instead of 10
2. **More Efficient** - No unnecessary checks
3. **More Reliable** - Uses proven patterns from top platforms
4. **Easier to Maintain** - Less code, less complexity

## How It Works

### Login Sync:
1. User logs in via Mercury → Cookies set
2. Mercury broadcasts `user-login` event (BroadcastChannel/postMessage)
3. Venus detects via:
   - BroadcastChannel/postMessage event (immediate)
   - Visibility change (when tab becomes visible)
4. All call `checkSession()` → Promise cache ensures single API call

### Logout Sync:
1. User logs out via Mercury → Cookies cleared
2. Mercury broadcasts `upswitch-logout` event (BroadcastChannel/postMessage)
3. Venus detects via:
   - BroadcastChannel/postMessage event (immediate)
   - Visibility change (when tab becomes visible)
4. All call `checkSession()` → Promise cache ensures single API call

## Comparison

### Before (Overkill):
- 10+ detection methods
- Periodic polling every 15s
- Navigation checks
- Focus events
- Online events
- Storage events (broken cross-subdomain)
- Multiple watchers

### After (Stripe/Airbnb):
- 2 detection methods
- BroadcastChannel/postMessage (efficient)
- Visibility change (minimal)
- No polling
- No navigation checks
- No focus events
- No online events
- No storage events
- Single watcher

## Result

**Simpler, cleaner, more efficient** - matching what top platforms actually do.
