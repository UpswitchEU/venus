# Conversational Valuation Feature

**Purpose**: AI-guided conversational flow for business valuation with natural language interaction.

---

## What

The conversational valuation feature provides an intuitive, chat-based interface for gathering business information and generating valuations. Users interact with an AI assistant that guides them through the valuation process via natural language conversation.

### Key Components

- **ConversationalLayout**: Main layout orchestrating chat panel, report panel, and toolbar
- **ConversationPanel**: Chat interface with message history and input
- **ReportPanel**: Live valuation report display with preview/info tabs
- **BusinessProfileSection**: Structured business profile summary

### Core Hooks

- **useConversationRestoration**: Restores conversation state from Python backend
- **useConversationalToolbar**: Consolidated toolbar handlers (refresh, download, tabs)
- **useReportIdTracking**: Tracks reportId changes across remounts
- **usePanelResize**: Manages resizable panel widths with persistence

---

## Why

### Business Rationale

- **Lower Barrier to Entry**: Conversational interface is more approachable than complex forms
- **Guided Experience**: AI asks relevant questions based on business type
- **Dynamic Validation**: Real-time feedback and validation during conversation
- **Higher Completion Rate**: Users more likely to complete via conversation

### Technical Rationale

- **State Restoration**: Seamlessly resume conversations across sessions
- **Real-time Streaming**: Immediate AI responses via SSE
- **Fail-Proof Architecture**: Automatic retry, circuit breakers, request deduplication
- **Unified Data Flow**: Same backend pipeline as manual flow

---

## How

### Architecture Overview

```
User Input
    ↓
ConversationPanel
    ↓
StreamingChatService → Python Backend (ValuationIQ)
    ↓                          ↓
ConversationContext ← SSE Stream (messages, data collection, valuation)
    ↓
ReportPanel (live report display)
```

### State Management

**Conversation State** (`ConversationContext`):
- Messages (user + AI)
- Business profile data
- Valuation result
- Python session ID
- Generation state

**Session State** (`useValuationSessionStore`):
- Report ID
- Current view (conversational)
- Partial data
- Sync status

**Results State** (`useValuationResultsStore`):
- Valuation result
- HTML report
- Confidence scores

### Data Flow

1. **User sends message** → StreamingChatService
2. **Python backend processes** → Extracts data, generates response
3. **SSE stream returns** → Message chunks, data updates, valuation result
4. **Context updates** → Business profile, messages, valuation
5. **Report renders** → Live HTML report display

---

## Strategy

### Fail-Proof Session Restoration

**Problem**: Users switching flows or refreshing page lose conversation state.

**Solution**: Multi-layered restoration strategy:

1. **Request Deduplication**: Prevents concurrent restoration conflicts
2. **Exponential Backoff Retry**: Auto-recovers from transient failures (network glitches, rate limits)
3. **Circuit Breaker**: Fast-fails when backend is down (prevents cascading failures)
4. **Idempotency Keys**: Safe retries without duplicate sessions
5. **Correlation IDs**: End-to-end request tracing for debugging
6. **Performance Monitoring**: Enforces <2s restoration target
7. **Audit Trail**: Immutable logging for compliance

### Error Recovery

**Error Types**:
- **NetworkError**: Retry with backoff
- **RateLimitError**: Exponential backoff with longer delays
- **SessionConflictError**: Load existing session
- **RestorationError**: Start fresh conversation
- **ValidationError**: Show user-friendly message

**Recovery Strategy**:
```typescript
try {
  await restoreConversation(sessionId)
} catch (error) {
  if (isNetworkError(error)) {
    // Retry automatically via retryWithBackoff
  } else if (isSessionConflictError(error)) {
    // Load existing session
  } else if (isRestorationError(error)) {
    // Start new conversation (graceful degradation)
  } else {
    // Log and notify user
  }
}
```

### Performance Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| Restoration | <1s | <2s |
| Message send | <500ms | <1s |
| Report render | <500ms | <1s |
| Panel resize | <16ms | <32ms |

---

## Usage Examples

### Basic Usage

```typescript
import { ConversationalLayout } from '@/features/conversational'

function ValuationPage() {
  const reportId = useParams().id
  
  return (
    <ConversationalLayout
      reportId={reportId}
      onComplete={(result) => {
        console.log('Valuation completed:', result)
      }}
      initialQuery="Restaurant"
      autoSend={true}
    />
  )
}
```

### With Custom Hooks

```typescript
import { useConversationRestoration } from '@/features/conversational/hooks'

function CustomRestoration() {
  const { state, restore, reset } = useConversationRestoration({
    sessionId: 'val_123',
    enabled: true,
    onRestored: (messages, pythonSessionId) => {
      console.log('Restored:', messages.length, 'messages')
    },
    onError: (error) => {
      console.error('Restoration failed:', error)
    },
  })
  
  return (
    <div>
      {state.isRestoring && <LoadingSpinner />}
      {state.isRestored && <MessageList messages={state.messages} />}
      <button onClick={reset}>Reset</button>
    </div>
  )
}
```

### Toolbar Integration

```typescript
import { useConversationalToolbar } from '@/hooks/useConversationalToolbar'

function CustomToolbar() {
  const toolbar = useConversationalToolbar({
    reportId: 'val_123',
    restoration,
    actions,
    state,
    result,
  })
  
  return (
    <div>
      <button onClick={toolbar.handleRefresh}>New Conversation</button>
      <button onClick={toolbar.handleDownload}>Download PDF</button>
      <TabGroup activeTab={toolbar.activeTab} onTabChange={toolbar.handleTabChange} />
    </div>
  )
}
```

---

## Directory Structure

```
features/conversational/
├── components/
│   ├── ConversationalLayout.tsx    # Main layout orchestrator
│   ├── ConversationPanel.tsx       # Chat interface
│   ├── ReportPanel.tsx             # Report display
│   ├── BusinessProfileSection.tsx  # Business profile summary
│   └── PreConversationSummary.tsx  # Pre-conversation data display
├── context/
│   └── ConversationContext.tsx     # Conversation state management
├── hooks/
│   ├── useConversationRestoration.ts  # Restoration logic
│   ├── index.ts                       # Exported hooks
│   └── __tests__/                     # Hook tests
├── __tests__/
│   └── restoration.integration.test.tsx  # Integration tests
└── README.md                        # This file
```

---

## Related Documentation

### Architecture
- [SESSION_RESTORATION_ARCHITECTURE.md](../../docs/architecture/SESSION_RESTORATION_ARCHITECTURE.md) - Restoration architecture
- [COMPLETE_FLOW_DOCUMENTATION.md](../../docs/architecture/COMPLETE_FLOW_DOCUMENTATION.md) - Complete flow documentation

### Utilities
- [utils/sessionErrorHandlers.ts](../../src/utils/sessionErrorHandlers.ts) - Session error recovery
- [utils/errors/ApplicationErrors.ts](../../src/utils/errors/ApplicationErrors.ts) - Custom error classes
- [utils/retryWithBackoff.ts](../../src/utils/retryWithBackoff.ts) - Retry logic
- [utils/circuitBreaker.ts](../../src/utils/circuitBreaker.ts) - Circuit breaker pattern
- [utils/requestDeduplication.ts](../../src/utils/requestDeduplication.ts) - Request deduplication

### Refactoring
- [REFACTORING_LOG.md](../../docs/refactoring/REFACTORING_LOG.md) - Refactoring history
- [SOLID_REFACTORING_COMPLETED.md](../../docs/refactoring/SOLID_REFACTORING_COMPLETED.md) - SOLID compliance

### Framework
- [BANK_GRADE_EXCELLENCE_FRAMEWORK.md](../../docs/refactoring/BANK_GRADE_EXCELLENCE_FRAMEWORK.md) - Excellence standards
- [02-FRONTEND-REFACTORING-GUIDE.md](../../docs/refactoring/02-FRONTEND-REFACTORING-GUIDE.md) - Frontend refactoring guide

---

## Testing

### Unit Tests
- `hooks/__tests__/useConversationRestoration.test.ts` - Restoration hook tests
- `utils/__tests__/sessionErrorHandlers.test.ts` - Error handler tests
- `utils/__tests__/retryWithBackoff.test.ts` - Retry logic tests
- `utils/__tests__/circuitBreaker.test.ts` - Circuit breaker tests

### Integration Tests
- `features/conversational/__tests__/restoration.integration.test.tsx` - End-to-end restoration tests

### Test Coverage
- Error utilities: >95%
- Session handlers: >90%
- Restoration hook: >85%
- Integration: All critical paths

---

## Monitoring & Observability

### Performance Metrics

Automatic monitoring via `globalPerformanceMonitor`:
- Restoration duration (target: <1s)
- Message send latency
- Report render time
- Session operations

### Audit Trail

All operations logged via `globalAuditTrail`:
- Session creation
- Conversation restoration
- View switching
- Data updates

Access metrics:
```typescript
import { globalSessionMetrics } from '@/utils/metrics/sessionMetrics'

// Get current metrics
const metrics = globalSessionMetrics.getMetrics()
console.log('Success rate:', metrics.successfulOperations / metrics.totalOperations)

// Log summary
globalSessionMetrics.logSummary()
```

### Error Tracking

All errors are specific types (no generic catches):
```typescript
import { isNetworkError, isRateLimitError } from '@/utils/errors/errorGuards'

catch (error) {
  if (isNetworkError(error)) {
    // Handle network failure
  } else if (isRateLimitError(error)) {
    // Handle rate limit
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue**: Conversation not restoring
- **Check**: Circuit breaker state (`sessionCircuitBreaker.getState()`)
- **Fix**: Wait 30s for circuit to reset, or manually reset

**Issue**: 409 Conflict errors
- **Check**: Request deduplication stats (`globalRequestDeduplicator.getStats()`)
- **Fix**: Already handled automatically - check logs for details

**Issue**: Slow restoration (>2s)
- **Check**: Performance metrics (`globalPerformanceMonitor.getStats('conversation-restore')`)
- **Fix**: Review backend performance, check network latency

**Issue**: Messages not appearing
- **Check**: Restoration state (`restoration.state`)
- **Fix**: Verify Python session ID, check backend logs

---

**Last Updated**: December 13, 2025  
**Status**: Production  
**Maintainer**: Frontend Team

# Conversational Valuation Feature

**Purpose**: AI-guided conversational flow for business valuation with natural language interaction.

---

## What

The conversational valuation feature provides an intuitive, chat-based interface for gathering business information and generating valuations. Users interact with an AI assistant that guides them through the valuation process via natural language conversation.

### Key Components

- **ConversationalLayout**: Main layout orchestrating chat panel, report panel, and toolbar
- **ConversationPanel**: Chat interface with message history and input
- **ReportPanel**: Live valuation report display with preview/info tabs
- **BusinessProfileSection**: Structured business profile summary

### Core Hooks

- **useConversationRestoration**: Restores conversation state from Python backend
- **useConversationalToolbar**: Consolidated toolbar handlers (refresh, download, tabs)
- **useReportIdTracking**: Tracks reportId changes across remounts
- **usePanelResize**: Manages resizable panel widths with persistence

---

## Why

### Business Rationale

- **Lower Barrier to Entry**: Conversational interface is more approachable than complex forms
- **Guided Experience**: AI asks relevant questions based on business type
- **Dynamic Validation**: Real-time feedback and validation during conversation
- **Higher Completion Rate**: Users more likely to complete via conversation

### Technical Rationale

- **State Restoration**: Seamlessly resume conversations across sessions
- **Real-time Streaming**: Immediate AI responses via SSE
- **Fail-Proof Architecture**: Automatic retry, circuit breakers, request deduplication
- **Unified Data Flow**: Same backend pipeline as manual flow

---

## How

### Architecture Overview

```
User Input
    ↓
ConversationPanel
    ↓
StreamingChatService → Python Backend (ValuationIQ)
    ↓                          ↓
ConversationContext ← SSE Stream (messages, data collection, valuation)
    ↓
ReportPanel (live report display)
```

### State Management

**Conversation State** (`ConversationContext`):
- Messages (user + AI)
- Business profile data
- Valuation result
- Python session ID
- Generation state

**Session State** (`useValuationSessionStore`):
- Report ID
- Current view (conversational)
- Partial data
- Sync status

**Results State** (`useValuationResultsStore`):
- Valuation result
- HTML report
- Confidence scores

### Data Flow

1. **User sends message** → StreamingChatService
2. **Python backend processes** → Extracts data, generates response
3. **SSE stream returns** → Message chunks, data updates, valuation result
4. **Context updates** → Business profile, messages, valuation
5. **Report renders** → Live HTML report display

---

## Strategy

### Fail-Proof Session Restoration

**Problem**: Users switching flows or refreshing page lose conversation state.

**Solution**: Multi-layered restoration strategy:

1. **Request Deduplication**: Prevents concurrent restoration conflicts
2. **Exponential Backoff Retry**: Auto-recovers from transient failures (network glitches, rate limits)
3. **Circuit Breaker**: Fast-fails when backend is down (prevents cascading failures)
4. **Idempotency Keys**: Safe retries without duplicate sessions
5. **Correlation IDs**: End-to-end request tracing for debugging
6. **Performance Monitoring**: Enforces <2s restoration target
7. **Audit Trail**: Immutable logging for compliance

### Error Recovery

**Error Types**:
- **NetworkError**: Retry with backoff
- **RateLimitError**: Exponential backoff with longer delays
- **SessionConflictError**: Load existing session
- **RestorationError**: Start fresh conversation
- **ValidationError**: Show user-friendly message

**Recovery Strategy**:
```typescript
try {
  await restoreConversation(sessionId)
} catch (error) {
  if (isNetworkError(error)) {
    // Retry automatically via retryWithBackoff
  } else if (isSessionConflictError(error)) {
    // Load existing session
  } else if (isRestorationError(error)) {
    // Start new conversation (graceful degradation)
  } else {
    // Log and notify user
  }
}
```

### Performance Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| Restoration | <1s | <2s |
| Message send | <500ms | <1s |
| Report render | <500ms | <1s |
| Panel resize | <16ms | <32ms |

---

## Usage Examples

### Basic Usage

```typescript
import { ConversationalLayout } from '@/features/conversational'

function ValuationPage() {
  const reportId = useParams().id
  
  return (
    <ConversationalLayout
      reportId={reportId}
      onComplete={(result) => {
        console.log('Valuation completed:', result)
      }}
      initialQuery="Restaurant"
      autoSend={true}
    />
  )
}
```

### With Custom Hooks

```typescript
import { useConversationRestoration } from '@/features/conversational/hooks'

function CustomRestoration() {
  const { state, restore, reset } = useConversationRestoration({
    sessionId: 'val_123',
    enabled: true,
    onRestored: (messages, pythonSessionId) => {
      console.log('Restored:', messages.length, 'messages')
    },
    onError: (error) => {
      console.error('Restoration failed:', error)
    },
  })
  
  return (
    <div>
      {state.isRestoring && <LoadingSpinner />}
      {state.isRestored && <MessageList messages={state.messages} />}
      <button onClick={reset}>Reset</button>
    </div>
  )
}
```

### Toolbar Integration

```typescript
import { useConversationalToolbar } from '@/hooks/useConversationalToolbar'

function CustomToolbar() {
  const toolbar = useConversationalToolbar({
    reportId: 'val_123',
    restoration,
    actions,
    state,
    result,
  })
  
  return (
    <div>
      <button onClick={toolbar.handleRefresh}>New Conversation</button>
      <button onClick={toolbar.handleDownload}>Download PDF</button>
      <TabGroup activeTab={toolbar.activeTab} onTabChange={toolbar.handleTabChange} />
    </div>
  )
}
```

---

## Directory Structure

```
features/conversational/
├── components/
│   ├── ConversationalLayout.tsx    # Main layout orchestrator
│   ├── ConversationPanel.tsx       # Chat interface
│   ├── ReportPanel.tsx             # Report display
│   ├── BusinessProfileSection.tsx  # Business profile summary
│   └── PreConversationSummary.tsx  # Pre-conversation data display
├── context/
│   └── ConversationContext.tsx     # Conversation state management
├── hooks/
│   ├── useConversationRestoration.ts  # Restoration logic
│   ├── index.ts                       # Exported hooks
│   └── __tests__/                     # Hook tests
├── __tests__/
│   └── restoration.integration.test.tsx  # Integration tests
└── README.md                        # This file
```

---

## Related Documentation

### Architecture
- [SESSION_RESTORATION_ARCHITECTURE.md](../../docs/architecture/SESSION_RESTORATION_ARCHITECTURE.md) - Restoration architecture
- [COMPLETE_FLOW_DOCUMENTATION.md](../../docs/architecture/COMPLETE_FLOW_DOCUMENTATION.md) - Complete flow documentation

### Utilities
- [utils/sessionErrorHandlers.ts](../../src/utils/sessionErrorHandlers.ts) - Session error recovery
- [utils/errors/ApplicationErrors.ts](../../src/utils/errors/ApplicationErrors.ts) - Custom error classes
- [utils/retryWithBackoff.ts](../../src/utils/retryWithBackoff.ts) - Retry logic
- [utils/circuitBreaker.ts](../../src/utils/circuitBreaker.ts) - Circuit breaker pattern
- [utils/requestDeduplication.ts](../../src/utils/requestDeduplication.ts) - Request deduplication

### Refactoring
- [REFACTORING_LOG.md](../../docs/refactoring/REFACTORING_LOG.md) - Refactoring history
- [SOLID_REFACTORING_COMPLETED.md](../../docs/refactoring/SOLID_REFACTORING_COMPLETED.md) - SOLID compliance

### Framework
- [BANK_GRADE_EXCELLENCE_FRAMEWORK.md](../../docs/refactoring/BANK_GRADE_EXCELLENCE_FRAMEWORK.md) - Excellence standards
- [02-FRONTEND-REFACTORING-GUIDE.md](../../docs/refactoring/02-FRONTEND-REFACTORING-GUIDE.md) - Frontend refactoring guide

---

## Testing

### Unit Tests
- `hooks/__tests__/useConversationRestoration.test.ts` - Restoration hook tests
- `utils/__tests__/sessionErrorHandlers.test.ts` - Error handler tests
- `utils/__tests__/retryWithBackoff.test.ts` - Retry logic tests
- `utils/__tests__/circuitBreaker.test.ts` - Circuit breaker tests

### Integration Tests
- `features/conversational/__tests__/restoration.integration.test.tsx` - End-to-end restoration tests

### Test Coverage
- Error utilities: >95%
- Session handlers: >90%
- Restoration hook: >85%
- Integration: All critical paths

---

## Monitoring & Observability

### Performance Metrics

Automatic monitoring via `globalPerformanceMonitor`:
- Restoration duration (target: <1s)
- Message send latency
- Report render time
- Session operations

### Audit Trail

All operations logged via `globalAuditTrail`:
- Session creation
- Conversation restoration
- View switching
- Data updates

Access metrics:
```typescript
import { globalSessionMetrics } from '@/utils/metrics/sessionMetrics'

// Get current metrics
const metrics = globalSessionMetrics.getMetrics()
console.log('Success rate:', metrics.successfulOperations / metrics.totalOperations)

// Log summary
globalSessionMetrics.logSummary()
```

### Error Tracking

All errors are specific types (no generic catches):
```typescript
import { isNetworkError, isRateLimitError } from '@/utils/errors/errorGuards'

catch (error) {
  if (isNetworkError(error)) {
    // Handle network failure
  } else if (isRateLimitError(error)) {
    // Handle rate limit
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue**: Conversation not restoring
- **Check**: Circuit breaker state (`sessionCircuitBreaker.getState()`)
- **Fix**: Wait 30s for circuit to reset, or manually reset

**Issue**: 409 Conflict errors
- **Check**: Request deduplication stats (`globalRequestDeduplicator.getStats()`)
- **Fix**: Already handled automatically - check logs for details

**Issue**: Slow restoration (>2s)
- **Check**: Performance metrics (`globalPerformanceMonitor.getStats('conversation-restore')`)
- **Fix**: Review backend performance, check network latency

**Issue**: Messages not appearing
- **Check**: Restoration state (`restoration.state`)
- **Fix**: Verify Python session ID, check backend logs

---

**Last Updated**: December 13, 2025  
**Status**: Production  
**Maintainer**: Frontend Team


