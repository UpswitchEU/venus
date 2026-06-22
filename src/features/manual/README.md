# Manual Valuation Feature

**Purpose**: Traditional form-based valuation flow for structured business data collection.

---

## What

The manual valuation feature provides a comprehensive form-based interface for collecting business information and generating valuations. Users fill out structured forms with business details, financial data, and operational metrics.

### Key Components

- **ManualLayout**: Main layout orchestrating form panel, report panel, and toolbar
- **ValuationForm**: Multi-section form with validation and real-time updates
- **ReportPanel**: Live valuation report display with preview/info tabs

### Core Hooks

- **useValuationToolbarTabs**: Manages report tab switching (Preview/Source/Info)
- **useValuationToolbarRefresh**: Handles new valuation creation
- **useValuationToolbarDownload**: Manages PDF download functionality
- **useValuationToolbarFullscreen**: Controls fullscreen report view

---

## Why

### Business Rationale

- **Structured Data Entry**: Forms provide clear, organized data collection
- **Familiar UX**: Traditional form interface is familiar to users
- **Complete Control**: Users can review and edit all fields before submission
- **No Credits Required**: Free for both guest and authenticated users

### Technical Rationale

- **Real-time Validation**: Immediate feedback on form inputs
- **Session Persistence**: Form data saved automatically to backend
- **Unified Backend**: Same Python backend as conversational flow
- **Responsive Design**: Works on desktop and mobile devices

---

## How

### Architecture Overview

```
User Input (Form Fields)
    ↓
ValuationForm
    ↓
useValuationSessionStore → Backend API
    ↓                          ↓
ReportPanel ← ValuationResponse (HTML report)
```

### State Management

**Form State** (`useValuationFormStore`):
- Form field values
- Validation errors
- Field completeness
- Section completion status

**Session State** (`useValuationSessionStore`):
- Report ID
- Current view (manual)
- Partial data
- Sync status
- Save status

**Results State** (`useValuationResultsStore`):
- Valuation result
- HTML report
- Confidence scores

### Data Flow

1. **User fills form** → Form state updates
2. **Auto-save triggers** → Session store syncs to backend
3. **User submits** → Backend calculates valuation
4. **Response received** → Results store updated
5. **Report renders** → Live HTML report display

---

## Strategy

### Form Validation

**Client-side Validation**:
- Required field checks
- Format validation (numbers, dates, emails)
- Range validation (positive numbers, valid percentages)
- Cross-field validation (e.g., revenue > expenses)

**Backend Validation**:
- Business logic validation
- Data quality checks
- Industry-specific rules

### Session Persistence

**Auto-save Strategy**:
- Debounced saves on field changes (500ms delay)
- Save on blur events
- Save before navigation
- Save on form submission

**Conflict Resolution**:
- Optimistic updates
- Last-write-wins for concurrent edits
- Error recovery with retry logic

### Performance Optimization

- **Debounced Inputs**: Reduces API calls during typing
- **Lazy Loading**: Report panel loads on demand
- **Code Splitting**: Form sections loaded dynamically
- **Memoization**: Expensive calculations memoized

---

## Usage Examples

### Basic Usage

```typescript
import { ManualValuationWorkspace } from '@/features/manual'

function ValuationPage() {
  const reportId = useParams().id
  
  return (
    <ManualValuationWorkspace
      reportId={reportId}
      onComplete={(result) => {
        console.log('Valuation completed:', result)
      }}
      initialMode="edit"
    />
  )
}
```

### With Custom Handlers

```typescript
import { ManualValuationWorkspace } from '@/features/manual'
import { useValuationSessionStore } from '@/store/useValuationSessionStore'

function CustomManualFlow() {
  const { syncFromManualForm, syncToManualForm } = useValuationSessionStore()
  
  return (
    <ManualValuationWorkspace
      reportId="val_123"
      onComplete={(result) => {
        // Custom completion handler
        syncFromManualForm()
        navigate(`/reports/${result.valuation_id}`)
      }}
    />
  )
}
```

### Form Integration

```typescript
import { ValuationForm } from '@/components/ValuationForm'
import { useValuationFormStore } from '@/store/useValuationFormStore'

function CustomForm() {
  const { formData, updateFormData, validateForm } = useValuationFormStore()
  
  const handleSubmit = async () => {
    if (validateForm()) {
      await calculateValuation(formData)
    }
  }
  
  return (
    <ValuationForm
      data={formData}
      onChange={updateFormData}
      onSubmit={handleSubmit}
    />
  )
}
```

---

## Directory Structure

```
features/manual/
├── components/
│   ├── ManualValuationWorkspace.tsx # Route-level manual valuation workspace
│   ├── ManualLayout.tsx             # Compatibility alias
│   └── index.ts            # Component exports
├── index.ts                # Feature exports
└── README.md               # This file
```

---

## Related Documentation

### Architecture
- [COMPLETE_FLOW_DOCUMENTATION.md](../../docs/architecture/COMPLETE_FLOW_DOCUMENTATION.md) - Complete flow documentation
- [DATA_FLOW.md](../../docs/architecture/DATA_FLOW.md) - Data flow architecture

### Components
- [ValuationForm](../../components/ValuationForm.tsx) - Main form component
- [ReportPanel](../conversational/components/ReportPanel.tsx) - Report display component

### Stores
- [useValuationFormStore](../../store/useValuationFormStore.ts) - Form state management
- [useValuationSessionStore](../../store/useValuationSessionStore.ts) - Session state management
- [useValuationResultsStore](../../store/useValuationResultsStore.ts) - Results state management

### Refactoring
- [02-FRONTEND-REFACTORING-GUIDE.md](../../docs/refactoring/02-FRONTEND-REFACTORING-GUIDE.md) - Frontend refactoring guide
- [BANK_GRADE_EXCELLENCE_FRAMEWORK.md](../../docs/refactoring/BANK_GRADE_EXCELLENCE_FRAMEWORK.md) - Excellence standards

---

## Testing

### Unit Tests
- `components/__tests__/ManualLayout.test.tsx` - Layout component tests
- `store/__tests__/useValuationFormStore.test.ts` - Form store tests

### Integration Tests
- `features/manual/__tests__/manual-flow.integration.test.tsx` - End-to-end flow tests

### Test Coverage
- Form validation: >90%
- Session persistence: >85%
- Report rendering: >80%

---

## Monitoring & Observability

### Performance Metrics

Automatic monitoring via `globalPerformanceMonitor`:
- Form render time (target: <100ms)
- Auto-save latency (target: <500ms)
- Report calculation time (target: <2s)
- Session sync duration

### Error Tracking

All errors use specific types:
```typescript
import { isValidationError, isNetworkError } from '@/utils/errors/errorGuards'

catch (error) {
  if (isValidationError(error)) {
    // Show validation message
  } else if (isNetworkError(error)) {
    // Retry with backoff
  }
}
```

---

## Troubleshooting

### Common Issues

**Issue**: Form data not saving
- **Check**: Session store sync status (`syncError`)
- **Fix**: Check network connection, verify backend is accessible

**Issue**: Validation errors not clearing
- **Check**: Form validation state (`validationErrors`)
- **Fix**: Ensure all required fields are filled correctly

**Issue**: Report not updating
- **Check**: Results store state (`result`)
- **Fix**: Verify backend calculation completed successfully

**Issue**: Panel resize not persisting
- **Check**: localStorage availability
- **Fix**: Check browser localStorage permissions

---

**Last Updated**: January 2025  
**Status**: Production  
**Maintainer**: Frontend Team
