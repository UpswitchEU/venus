# Features Architecture

This directory contains feature-based modules following clean architecture principles.

## Structure

```
features/
├── valuation/          # Unified valuation workflow (manual + conversational)
│   ├── components/     # Unified ValuationFlow component
│   ├── index.ts        # Public API exports
│   └── README.md       # Feature documentation
├── manual-valuation/   # Manual form-based valuation
├── conversational/ # AI-assisted conversational valuation
├── auth/               # Authentication & authorization
└── shared/             # Shared components and utilities
```

## Design Principles

### 1. Feature-Based Organization
Each feature is self-contained with its own components, hooks, services, and types. This makes it easy to:
- Locate related code
- Understand feature boundaries
- Refactor independently
- Test in isolation

### 2. Separation of Concerns
- **Components**: UI only, no business logic
- **Hooks**: State management and side effects
- **Services**: API calls and business logic
- **Types**: TypeScript definitions

### 3. Public API Pattern
Each feature exports a public API via `index.ts` files. Internal implementation details are hidden.

## Usage Examples

### Using Valuation Feature

```tsx
import { useValuationOrchestrator } from '@/features/valuation';

function MyComponent() {
  const {
    stage,
    valuationResult,
    handleValuationComplete,
  } = useValuationOrchestrator({
    reportId: 'val_123',
    // ... other options
  });
  
  // Use orchestrator state and handlers
}
```

### Using Conversation Feature

```tsx
import { Conversation } from '@/features/conversation';

function ChatInterface() {
  return (
    <Conversation value={conversationData}>
      <Conversation.Header />
      <Conversation.Messages />
      <Conversation.Input />
    </Conversation>
  );
}
```

### Using Report Feature

```tsx
import { Report } from '@/features/reports';

function ReportView() {
  return (
    <Report value={reportData}>
      <Report.Header />
      <Report.Progress />
      <Report.Content />
      <Report.Actions />
    </Report>
  );
}
```

## Migration Guide

### From Old Structure

**Before:**
```tsx
// Note: AIAssistedValuation has been replaced by ConversationalLayout
```

**After:**
```tsx
import { ConversationalLayout } from '@/features/conversational/components/ConversationalLayout';
```

### Key Changes

1. **Hooks extracted**: Business logic moved to custom hooks
2. **Components split**: Large components broken into smaller pieces
3. **Type safety**: Zod schemas for runtime validation
4. **Error handling**: Specific error types instead of generic Error
5. **Performance**: Memoization and code splitting added

## Session Restoration

**Critical Feature**: Valuation data now persists across page refreshes.

**Implementation**: See [`/docs/RESTORATION_ARCHITECTURE.md`](../../docs/RESTORATION_ARCHITECTURE.md) for complete details.

**Key Changes** (December 17, 2025):
- Fixed HTML report restoration in both Manual and Conversational flows
- Added feature flag `ENABLE_SESSION_RESTORATION` for safe rollback
- Comprehensive logging and verification
- Full test coverage (unit + integration + E2E)

**What Persists**:
- ✅ Form input data (company name, revenue, etc.)
- ✅ Valuation results (calculations, metrics)
- ✅ HTML reports (main report + info tab)
- ✅ Final valuation price
- ✅ Version history

**Files Modified**:
- `manual/components/ManualValuationWorkspace.tsx` - HTML merging fix
- `conversational/components/ConversationalLayout.tsx` - HTML merging fix
- `config/features.ts` - Restoration feature flag

## Best Practices

1. **Keep components small**: Max 300 lines per component
2. **Use hooks for logic**: Extract business logic to custom hooks
3. **Validate at boundaries**: Use Zod schemas for API responses
4. **Handle errors specifically**: Use domain-specific error types
5. **Memoize expensive operations**: Use React.memo, useMemo, useCallback
6. **Code split heavy components**: Lazy load routes and heavy components
7. **Test restoration**: Always test data persistence after page refresh

## Testing

Each feature should have:
- Unit tests for hooks (`*.test.ts`)
- Component tests (`*.test.tsx`)
- Integration tests for workflows

## Documentation

- Add JSDoc comments to public APIs
- Document component props with TypeScript
- Include usage examples in README files

