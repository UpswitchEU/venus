# Valuation Service Consolidation Audit

## Overview

This audit identifies overlapping valuation services and recommends consolidation for a cleaner architecture.

## Current State: Multiple Overlapping Services

### 1. `services/valuation/ValuationService.ts` (PRIMARY)
- **Status**: Active, well-structured
- **Pattern**: Singleton
- **API**: `calculateValuation()` → `backendAPI.calculateValuation()`
- **Used by**: `useManualResultsStore`, `useConversationalResultsStore`
- **Features**: Error handling, logging, type safety

### 2. `features/valuation/services/valuationService.ts` (DUPLICATE)
- **Status**: Active, uses streaming adapter
- **Pattern**: Class with factory
- **API**: `calculateValuation()` → `manualValuationStreamService.streamManualValuation()`
- **Issues**: 
  - Comment says "temporary adapter - should be refactored"
  - 30-second timeout workaround
  - Duplicates functionality

### 3. `services/instantValuationService.ts` (SPECIALIZED)
- **Status**: Active
- **Pattern**: Singleton-like
- **API**: 
  - `processInstantValuation()` → `backendAPI.calculateInstantValuation()`
  - `processManualValuation()` → `backendAPI.calculateManualValuation()`
- **Purpose**: Flow-specific entry points

### 4. `services/manualValuationStreamService.ts` (STREAMING)
- **Status**: Active
- **Pattern**: Singleton
- **API**: `streamManualValuation()` → SSE streaming to Titan
- **Purpose**: Server-Sent Events for real-time progress

## Recommended Consolidation

### Target Architecture

```
UnifiedValuationService
├── calculateValuation(request, options)
│   ├── options.streaming = false → HTTP POST to Titan
│   └── options.streaming = true → SSE stream to Titan
├── getValuationProgress(valuationId)
└── cancelValuation(valuationId)
```

### Implementation Steps

1. **Keep**: `services/valuation/ValuationService.ts` as the primary service
2. **Deprecate**: `features/valuation/services/valuationService.ts`
3. **Merge**: `instantValuationService` into main ValuationService
4. **Integrate**: Streaming support from `manualValuationStreamService`

### Unified Service Interface

```typescript
interface UnifiedValuationService {
  /**
   * Calculate valuation (primary method)
   * @param request - Valuation input data
   * @param options - Optional streaming/progress callbacks
   */
  calculateValuation(
    request: ValuationRequest,
    options?: {
      streaming?: boolean;
      onProgress?: (progress: number, message: string) => void;
      onComplete?: (result: ValuationResponse) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<ValuationResponse>;
}
```

## Files to Update After Consolidation

| File | Change |
|------|--------|
| `features/valuation/services/valuationService.ts` | Delete or redirect |
| `services/instantValuationService.ts` | Delete, use main service |
| Components using duplicate services | Update imports |

## Priority

**Low** - Current implementation works, consolidation is optimization.

Recommend addressing after AUTH-FIRST architecture is fully stable.

## Benefits of Consolidation

1. **Single Source of Truth**: One service for all valuation operations
2. **Easier Maintenance**: Fewer files to maintain
3. **Consistent Error Handling**: Unified error patterns
4. **Better Testing**: Single service to test
5. **Cleaner Imports**: One import path for valuation logic
