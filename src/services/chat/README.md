# Chat Services

This directory contains service classes that handle chat-related functionality extracted from the StreamingChat component.

## Services Overview

### `StreamEventHandler.ts`
Centralized event handler for all Server-Sent Events (SSE) from the streaming conversation backend.

**Features:**
- Handles 15+ different event types
- Comprehensive logging for debugging
- Error handling with user-friendly messages
- Metrics tracking integration
- Callback-based architecture for flexibility

**Event Types Handled:**
- `typing` - AI typing indicator
- `message_start` - Start of AI response
- `message_chunk` - Stream content chunks
- `report_update` - Live report updates
- `section_loading` - Section loading states
- `report_section` - Progressive section updates
- `report_complete` - Final report completion
- `message_complete` - Message completion
- `valuation_complete` - Valuation results
- `error` - Error handling
- `data_collected` - Data collection events
- `suggestion_offered` - AI suggestions
- `valuation_preview` - Valuation previews
- `calculate_option` - Calculation options
- `progress_summary` - Progress updates
- `clarification_needed` - Clarification requests
- `html_preview` - HTML preview updates

**Usage:**
```typescript
const eventHandler = new StreamEventHandler(sessionId, {
  updateStreamingMessage,
  setIsStreaming,
  onValuationComplete,
  // ... other callbacks
});

// Handle incoming events
eventHandler.handleEvent(eventData);
```

### `StreamingManager.ts`
Manages streaming conversation logic including async generators, EventSource fallback, and retry mechanisms.

**Features:**
- Async generator streaming (primary method)
- EventSource fallback when generator fails
- Retry logic with exponential backoff
- Request deduplication
- Timeout handling (10 seconds)
- Business data extraction integration

**Usage:**
```typescript
const streamingManager = new StreamingManager(requestIdRef, currentStreamingMessageRef);

await streamingManager.startStreaming(
  sessionId,
  userInput,
  userId,
  callbacks,
  onEvent,
  onError
);
```

## Architecture Benefits

1. **Separation of Concerns**: Each service has a single responsibility
2. **Testability**: Services can be unit tested independently
3. **Reusability**: Services can be used by other components
4. **Maintainability**: Changes are isolated to specific services
5. **Error Handling**: Centralized error handling and logging

## Dependencies

- Custom logger utility
- Streaming chat service
- Type definitions from hooks
- React refs for state management

## Error Handling

Both services implement comprehensive error handling:

- **StreamEventHandler**: User-friendly error messages, graceful degradation
- **StreamingManager**: Retry logic, fallback mechanisms, timeout handling

## Logging

All services use structured logging with:
- Session IDs for tracking
- Event types and data
- Performance metrics
- Error details and stack traces

## Future Enhancements

- Add more sophisticated retry strategies
- Implement circuit breaker patterns
- Add performance monitoring
- Create service composition patterns
- Add more granular error types

## Testing Strategy

Each service should be tested with:
- Unit tests for individual methods
- Integration tests with mock dependencies
- Error scenario testing
- Performance testing under load
- Edge case validation

