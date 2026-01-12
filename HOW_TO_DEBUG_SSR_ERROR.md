# How to Debug SSR Error (Digest 561100505)

## 🔍 **The Problem**

The browser shows:
```
Error: An error occurred in the Server Components render. 
The specific message is omitted in production builds to avoid leaking sensitive details. 
A digest property is included on this error instance which may provide additional details about the nature of the error.
digest: '561100505'
```

**This is a security feature** - the actual error is hidden in production!

## ✅ **Solution: Check Vercel Server Logs**

### Method 1: Vercel Dashboard (Easiest)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the **venus** project
3. Click on **Deployments**
4. Click on the **latest deployment**
5. Go to the **Functions** tab
6. Click on the failing function (e.g., `/nl/reports/[id]`)
7. Look at the **Logs** - you'll see the ACTUAL error message

### Method 2: Vercel CLI

```bash
# Install Vercel CLI if not installed
npm i -g vercel

# Login
vercel login

# Link to project
cd apps/venus
vercel link

# Tail production logs (real-time)
vercel logs --follow

# Or get last 100 logs
vercel logs --limit 100
```

### Method 3: Enable Detailed Errors Locally

Test locally with production build:

```bash
cd apps/venus

# Build for production
npm run build

# Start production server
npm start

# Open in browser
open http://localhost:3000/nl/reports/val_test?embedded=true
```

Local production builds show more detailed errors than Vercel.

## 🔎 **What to Look For in Logs**

Search for these patterns:

### 1. Serialization Errors
```
Error: Only plain objects can be passed to Client Components from Server Components
```
**Fix**: Ensure all props are serializable (no functions, class instances, undefined)

### 2. Import Errors
```
Error: Cannot find module 'X'
Error: Module not found: Can't resolve 'X'
```
**Fix**: Check all imports in the page and components

### 3. Environment Variable Errors
```
Error: process is not defined
```
**Fix**: Use `NEXT_PUBLIC_` prefix for client-side env vars

### 4. Async Rendering Errors
```
Error: async/await is not yet supported in Client Components
```
**Fix**: Move async logic to Server Components

### 5. Locale/i18n Errors
```
Error: Locale 'X' is not supported
Error: Message for 'X' not found
```
**Fix**: Check i18n configuration and message files

## 🛠️ **Current Fix Applied**

The latest commit uses **dynamic import with `ssr: false`**:

```typescript
const ValuationReportClient = dynamic(
  () => import('./ValuationReportClient'),
  { ssr: false } // Completely bypass SSR
)
```

This means:
- ✅ No Server-Side Rendering of ValuationReport
- ✅ Client-side only rendering after hydration
- ✅ Should eliminate SSR errors
- ⚠️ Slightly slower initial load (shows loading spinner first)

## 📊 **Next Steps**

### If Error Persists After Latest Deployment:

1. **Check Vercel Logs** (see above) - this is CRITICAL
2. **Share the actual error message** - not just the digest
3. **Check if error happens for both locales** - `/en/reports/` and `/nl/reports/`
4. **Test standalone** - try accessing Venus directly (not in iframe)
5. **Check layout errors** - maybe error is in `[locale]/layout.tsx`

### If Error is in Layout:

The error might be coming from:
- `app/[locale]/layout.tsx` - locale layout
- `app/layout.tsx` - root layout  
- `i18n.ts` or `next-intl.config.ts` - i18n config

## 📝 **Common SSR Errors & Fixes**

| Error Type | Cause | Fix |
|------------|-------|-----|
| "Cannot read property of undefined" | Accessing undefined prop during SSR | Add null checks or default values |
| "window is not defined" | Using browser APIs during SSR | Wrap in `typeof window !== 'undefined'` |
| "localStorage is not defined" | Using localStorage during SSR | Move to useEffect or check window |
| "document is not defined" | Using DOM APIs during SSR | Wrap in client-side check |
| "Hydration mismatch" | Server/client render differently | Ensure consistent rendering |

## 🎯 **Expected Log Output**

When you check Vercel logs for digest `561100505`, you should see something like:

```
[Function: /nl/reports/[id]] Error: <ACTUAL ERROR MESSAGE HERE>
  at <stack trace>
  at <stack trace>
  ...
digest: 561100505
```

**THAT actual error message is what we need to fix the issue!**

## 🚨 **URGENT: Get The Real Error**

Without the actual error message from Vercel logs, we're flying blind. 
The digest is just a hash - we need the real error!

**Please check Vercel logs and share the actual error message.** 🙏
