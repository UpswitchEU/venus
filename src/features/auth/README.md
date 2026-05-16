# Authentication & Authorization Feature

**Purpose**: Authentication, authorization, and credit management for valuation flows.

---

## What

The auth feature provides authentication, authorization, and credit management functionality for the valuation tester application. It handles guest and authenticated user flows, credit tracking, and access control.

### Key Components

- **CreditGuard**: Wrapper component that blocks content when user is out of credits
- **OutOfCreditsModal**: Modal displayed when guest users run out of credits

### Core Hooks

- **useCreditGuard**: Hook for managing credit-based access control
- **useCredits**: Hook for fetching and managing user credits
- **useAuth**: Hook for authentication state management

### Services

- **guestCreditService**: Manages guest user credits via localStorage
- **creditAPI**: Backend API for credit operations

---

## Why

### Business Rationale

- **Credit System**: Controls access to AI-guided conversational valuations
- **Guest Access**: Provides 3 free credits for guest users to try the service
- **Unlimited Access**: Authenticated users have unlimited credits
- **Conversion Funnel**: Encourages guest users to sign up for unlimited access

### Technical Rationale

- **Access Control**: Prevents unauthorized access to premium features
- **Credit Tracking**: Accurate credit deduction and tracking
- **Session Management**: Handles authentication state across app
- **Error Handling**: Specific error types for credit-related failures

---

## How

### Architecture Overview

```
User Request
    ↓
CreditGuard / useCreditGuard
    ↓
Credit Check (guestCreditService / creditAPI)
    ↓
Access Granted/Denied
    ↓
OutOfCreditsModal (if denied)
```

### Credit System

**Guest Users**:
- 3 free credits stored in localStorage
- 1 credit per AI-guided valuation
- Credits deducted on flow start
- Credits reset on localStorage clear

**Authenticated Users**:
- Unlimited credits (or backend-managed)
- No credit checks for conversational flow
- Credit status fetched from backend

### Authentication Flow

**Guest-First Approach**:
1. Check for token in URL (from main app)
2. Check for existing session cookie
3. If neither, proceed as guest
4. Exchange token if present

**Token Exchange**:
- Token passed via URL parameter
- Exchanged for session cookie
- Session persisted for subsequent requests

---

## Strategy

### Credit Guard Logic

**Conversational Flow**:
- Guest users: Credit check required (1 credit)
- Authenticated users: No credit check

**Manual Flow**:
- Guest users: No credit check (free)
- Authenticated users: No credit check (free)

**Credit Deduction**:
- Deducted when flow starts (not on completion)
- Prevents multiple concurrent flows
- Refunded if flow fails before calculation

### Error Handling

**Credit Errors**:
- `CreditError`: Insufficient credits
- `QuotaExceededError`: Credit limit exceeded
- `RateLimitError`: Too many credit operations

**Recovery Strategy**:
```typescript
try {
  await startConversationalFlow()
} catch (error) {
  if (isCreditError(error)) {
    // Show out-of-credits modal
    showOutOfCreditsModal()
  } else if (isRateLimitError(error)) {
    // Show rate limit message
    showRateLimitMessage()
  }
}
```

---

## Usage Examples

### Basic Credit Guard

```typescript
import { CreditGuard } from '@/features/auth'
import { useCreditGuard } from '@/features/auth/hooks'

function ConversationalFlow() {
  const { hasCredits, isBlocked, showModal } = useCreditGuard({
    isAuthenticated: false,
    flowType: 'conversational',
  })
  
  return (
    <CreditGuard
      hasCredits={hasCredits}
      isBlocked={isBlocked}
      showOutOfCreditsModal={showModal}
      onCloseModal={() => undefined}
      onSignUp={() => navigate('/signup')}
      onTryManual={() => navigate('/manual')}
    >
      <ConversationalLayout />
    </CreditGuard>
  )
}
```

### Guest Credit Service

```typescript
import { guestCreditService } from '@/services/guestCreditService'

// Get current credits
const credits = guestCreditService.getCredits() // Returns 3 for guests

// Use a credit
const remaining = guestCreditService.useCredit() // Deducts 1 credit

// Check if user has credits
const hasCredits = guestCreditService.hasCredits() // Returns true if credits > 0

// Reset credits (for testing)
guestCreditService.resetCredits()
```

### Credit API

```typescript
import { creditAPI } from '@/services/api/credit/CreditAPI'

// Get credit status (authenticated users)
const status = await creditAPI.getCreditStatus()
console.log('Credits remaining:', status.creditsRemaining)
console.log('Is premium:', status.isPremium)

// Save valuation (deducts credit)
await creditAPI.saveValuation({
  valuationId: 'val_123',
  reportId: 'report_456',
})
```

### Authentication Hook

```typescript
import { useAuth } from '@/hooks/useAuth'

function MyComponent() {
  const { user, isAuthenticated, isLoading, error } = useAuth()
  
  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorDisplay error={error} />
  
  return (
    <div>
      {isAuthenticated ? (
        <p>Welcome, {user?.email}!</p>
      ) : (
        <p>Guest user</p>
      )}
    </div>
  )
}
```

---

## Directory Structure

```
features/auth/
├── components/
│   ├── CreditGuard.tsx      # Credit guard wrapper
│   └── index.ts             # Component exports
├── hooks/
│   ├── useCreditGuard.ts    # Credit guard hook
│   └── index.ts             # Hook exports
├── services/                # Auth-related services
├── types/
│   └── index.ts             # Type definitions
├── utils/                   # Auth utilities
├── index.ts                 # Feature exports
└── README.md                # This file
```

---

## Related Documentation

### Architecture
- [AI_GUIDED_AUTHENTICATION.md](../../docs/architecture/flows/AI_GUIDED_AUTHENTICATION.md) - Authentication requirements
- [FLOW_ARCHITECTURE_COMPLETE.md](../../docs/architecture/flows/FLOW_ARCHITECTURE_COMPLETE.md) - Flow architecture

### Services
- [guestCreditService](../../services/guestCreditService.ts) - Guest credit management
- [creditAPI](../../services/api/credit/CreditAPI.ts) - Credit API service
- [AuthContext](../../contexts/AuthContext.tsx) - Authentication context

### Hooks
- [useCredits](../../hooks/useCredits.ts) - Credit management hook
- [useAuth](../../hooks/useAuth.ts) - Authentication hook

### Refactoring
- [02-FRONTEND-REFACTORING-GUIDE.md](../../docs/refactoring/02-FRONTEND-REFACTORING-GUIDE.md) - Frontend refactoring guide
- [BANK_GRADE_EXCELLENCE_FRAMEWORK.md](../../docs/refactoring/BANK_GRADE_EXCELLENCE_FRAMEWORK.md) - Excellence standards

---

## Testing

### Unit Tests
- `hooks/__tests__/useCreditGuard.test.ts` - Credit guard hook tests
- `services/__tests__/guestCreditService.test.ts` - Guest credit service tests

### Integration Tests
- `features/auth/__tests__/credit-flow.integration.test.tsx` - Credit flow tests

### Test Coverage
- Credit guard logic: >90%
- Guest credit service: >95%
- Credit API: >85%

---

## Monitoring & Observability

### Credit Metrics

Track credit usage:
```typescript
import { guestCreditService } from '@/services/guestCreditService'

// Get credit stats
const stats = guestCreditService.getStats()
console.log('Credits used:', stats.creditsUsed)
console.log('Credits remaining:', stats.creditsRemaining)
```

### Error Tracking

All errors use specific types:
```typescript
import { isCreditError, isQuotaExceededError } from '@/utils/errors/errorGuards'

catch (error) {
  if (isCreditError(error)) {
    // Handle credit error
  } else if (isQuotaExceededError(error)) {
    // Handle quota exceeded
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue**: Credits not deducting
- **Check**: Guest credit service state (`guestCreditService.getCredits()`)
- **Fix**: Verify localStorage is accessible, check credit service initialization

**Issue**: Out-of-credits modal not showing
- **Check**: Credit guard state (`isBlocked`, `showOutOfCreditsModal`)
- **Fix**: Verify credit guard hook is properly configured

**Issue**: Authenticated users seeing credit checks
- **Check**: Authentication state (`isAuthenticated`)
- **Fix**: Verify token exchange completed successfully

**Issue**: Credits reset unexpectedly
- **Check**: localStorage persistence
- **Fix**: Check browser storage permissions, verify no localStorage clearing code

---

## Configuration

### Environment Variables

```env
# Unlimited credits mode (development only)
NEXT_PUBLIC_UNLIMITED_CREDITS_MODE=true

# Credit API endpoint
NEXT_PUBLIC_CREDIT_API_URL=https://api.example.com/credits
```

### Feature Flags

```typescript
// Enable unlimited credits (development)
const UNLIMITED_CREDITS = process.env.NEXT_PUBLIC_UNLIMITED_CREDITS_MODE === 'true'
```

---

**Last Updated**: January 2025  
**Status**: Production  
**Maintainer**: Frontend Team

