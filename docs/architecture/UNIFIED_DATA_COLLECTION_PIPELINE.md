# Unified Data Collection Pipeline Architecture

**Purpose**: Document the unified data collection pipeline that both manual and conversational flows converge to use.

**Last Updated**: December 14, 2025  
**Related**: See [COMPLETE_FLOW_DOCUMENTATION.md](./COMPLETE_FLOW_DOCUMENTATION.md) for detailed flow sequences

---

## Overview

Both manual and conversational flows converge to use the same data collection foundation from the moment data is collected. This ensures consistency, maintainability, and a single source of truth for valuation data.

---

## Architecture Pipeline

```mermaid
flowchart TD
    subgraph ManualFlowUI[Manual Flow UI]
        VF[ValuationForm Sections]
        VF -->|Custom Forms| CF[CustomBusinessTypeSearch<br/>CustomInputField<br/>CustomNumberInputField<br/>CustomDropdown<br/>HistoricalDataInputs]
        CF -->|formData| FS[useValuationFormStore.formData]
    end
    
    subgraph ConversationalFlowUI[Conversational Flow UI]
        SC[StreamingChat]
        SC -->|onDataCollected| Adapter[dataCollectionAdapter]
        Adapter -->|DataResponse[]| CDS[useValuationFormStore.collectedData]
    end
    
    subgraph UnifiedPipeline[Unified Data Collection Pipeline]
        FS -->|convertFormDataToDataResponses| DR1[DataResponse Array]
        DR1 -->|setCollectedData| CDS
        CDS -->|collectedData| Build[buildValuationRequest]
        Build -->|ValuationRequest| Calc[calculateValuation]
        Calc -->|ValuationResponse| RS[useValuationResultsStore.result]
    end
    
    subgraph DisplayLayer[Display Layer]
        RS -->|result| RP[ReportPanel]
        RP -->|Preview Tab| Results[Results Component]
        RP -->|Source Tab| HTML[HTMLView Component]
        RP -->|Info Tab| Info[ValuationInfoPanel Component]
    end
    
    subgraph LayoutComponents[Layout Components]
        ML[ManualValuationWorkspace]
        CL[ConversationalLayout]
        ML -->|Left Panel| VF
        ML -->|Right Panel| RP
        ML -->|Toolbar| VT[ValuationToolbar]
        CL -->|Left Panel| SC
        CL -->|Right Panel| RP
        CL -->|Toolbar| VT
        VT -->|Tab Change| RP
    end
    
    style ManualFlowUI fill:#1e293b,stroke:#334155,color:#fff
    style ConversationalFlowUI fill:#1e293b,stroke:#334155,color:#fff
    style UnifiedPipeline fill:#065f46,stroke:#047857,color:#fff
    style DisplayLayer fill:#7c2d12,stroke:#9a3412,color:#fff
    style LayoutComponents fill:#312e81,stroke:#4c1d95,color:#fff
```

**Key Points**:
- Both flows converge at `useValuationFormStore.collectedData`
- DataCollection UI removed but data sync still happens silently
- Custom forms are shared components (`src/components/forms/`)
- Toolbar controls ReportPanel tabs (Preview/Source/Info)
- 2-panel layout identical for both flows (form/chat left, report right)

---

## Data Flow Stages

### Stage 1: Data Collection

#### Manual Flow
```typescript
// User fills ValuationForm sections
ValuationForm Sections (BasicInformationSection, etc.)
  ↓ updateFormData()
formData (ValuationFormData)
  ↓ convertFormDataToDataResponses()
DataResponse[] = [
  {
    fieldId: "company_name",
    value: "Acme Corp",
    method: "manual_form",
    confidence: 1.0,
    source: "user_input",
    timestamp: Date
  },
  // ... more fields
]
  ↓ setCollectedData()
useValuationFormStore.collectedData
```

#### Conversational Flow
```typescript
// User chats with StreamingChat
StreamingChat onDataCollected({ field, value })
  ↓ dataCollectionAdapter.convertDataPointToDataResponse()
DataResponse = {
  fieldId: "company_name",
  value: "Acme Corp",
  method: "conversational",
  confidence: 0.9,
  source: "ai_extraction",
  timestamp: Date
}
  ↓ setCollectedData()
useValuationFormStore.collectedData
```

**Result**: Both flows produce the same `DataResponse[]` format and sync to `useValuationFormStore.collectedData`

### Stage 2: Data Normalization

**Location**: `src/utils/buildValuationRequest.ts`

**Function**: `buildValuationRequest(source: ValuationFormData | DataResponse[])`

**Process**:
1. If source is `DataResponse[]`: Convert to `ValuationFormData` using `convertDataResponsesToFormData()`
2. If source is `ValuationFormData`: Use directly
3. Apply normalization rules:
   - Year validation (2000-2100)
   - Recurring revenue clamping (0.0-1.0)
   - Company name trimming
   - Country code uppercase
   - Industry/business model defaults
   - Financial data merging
   - Historical data filtering
   - Sole trader handling
   - Business context mapping
4. Return `ValuationRequest` ready for API

**Used By**:
- Manual flow: `useValuationFormSubmission` hook
- Conversational flow: (Backend handles via streaming, but can use for preview)

### Stage 3: Valuation Calculation

**Location**: `src/store/useValuationApiStore.ts`

**Function**: `calculateValuation(request: ValuationRequest)`

**Process**:
1. Call `backendAPI.calculateValuationUnified(request)`
2. Store result in `useValuationResultsStore`
3. Return `ValuationResponse`

**Used By**:
- Manual flow: Form submission
- Conversational flow: Backend streaming (but same API endpoint)

### Stage 4: Result Display

**Location**: `src/features/conversational/components/ReportPanel.tsx` and `src/components/results/`

**Components**:
- `ReportPanel`: Shows Preview/Source/Info tabs
- `HTMLView`: Raw HTML source
- `ValuationInfoPanel`: Methodology details

**Data Source**: `useValuationResultsStore.result`

---

## Integration Points

### 1. ValuationForm → DataResponse[] Sync

**Location**: `src/components/ValuationForm/ValuationForm.tsx`

**Implementation**:
```typescript
// Debounced sync formData → DataResponse[]
useEffect(() => {
  if (formData && Object.keys(formData).length > 0) {
    const dataResponses = convertFormDataToDataResponses(formData)
    setCollectedData(dataResponses)
  }
}, [formData, setCollectedData])
```

**Purpose**: Keep `collectedData` in sync with form inputs for unified tracking

### 2. Form Submission → Unified Pipeline

**Location**: `src/components/ValuationForm/hooks/useValuationFormSubmission.ts`

**Implementation**:
```typescript
// Convert formData → DataResponse[]
const dataResponses = convertFormDataToDataResponses(formData)
setCollectedData(dataResponses) // Sync to unified pipeline

// Build request using unified function
const request = buildValuationRequest(formData)

// Calculate
const result = await calculateValuation(request)
```

**Purpose**: Ensure manual flow uses same pipeline as conversational flow

### 3. Silent Data Collection Sync

**Location**: `src/components/ValuationForm/ValuationForm.tsx`

**Purpose**: Silently sync form data to unified pipeline (no UI display)

**Implementation**:
```typescript
// Debounced sync formData → DataResponse[] (silent, no UI)
useEffect(() => {
  if (formData && Object.keys(formData).length > 0) {
    const dataResponses = convertFormDataToDataResponses(formData)
    setCollectedData(dataResponses) // Silent sync to unified pipeline
  }
}, [formData, setCollectedData])
```

**Note**: DataCollection UI component is **not displayed** in either flow. Data sync happens silently in the background to maintain unified pipeline consistency.

---

## Key Files

### Data Collection
- `src/types/data-collection.ts` - DataResponse type definitions
- `src/components/data-collection/DataCollection.tsx` - DataCollection component
- `src/utils/dataCollectionAdapter.ts` - Conversational → DataResponse converter
- `src/components/ValuationForm/utils/convertFormDataToDataResponses.ts` - Form → DataResponse converter

### Unified Pipeline
- `src/utils/buildValuationRequest.ts` - Unified request builder
- `src/utils/dataCollectionUtils.ts` - DataResponse → FormData converter
- `src/store/useValuationFormStore.ts` - Stores both formData and collectedData
- `src/store/useValuationApiStore.ts` - Unified calculation API

### Form Components
- `src/components/ValuationForm/ValuationForm.tsx` - Main form orchestrator
- `src/components/ValuationForm/sections/*.tsx` - Form sections
- `src/components/ValuationForm/hooks/useValuationFormSubmission.ts` - Submission logic

---

## Benefits

1. **Single Source of Truth**: Both flows use `useValuationFormStore.collectedData`
2. **Unified Normalization**: Same `buildValuationRequest()` function for both flows
3. **Consistent Data Format**: Both flows produce `DataResponse[]`
4. **Easier Maintenance**: Changes to normalization logic affect both flows
5. **Silent Data Sync**: Data collection happens in background without UI clutter
6. **Testability**: Unified functions easier to test in isolation
7. **Shared Components**: All custom forms in `src/components/forms/` for consistency

---

## Data Flow Summary

```
Manual Flow:
ValuationForm → formData → DataResponse[] → setCollectedData() → buildValuationRequest() → calculateValuation()

Conversational Flow:
StreamingChat → DataResponse[] → setCollectedData() → (Backend handles calculation via streaming)

Both Converge At:
- useValuationFormStore.collectedData (DataResponse[])
- buildValuationRequest() function (for manual flow)
- useValuationResultsStore.result (ValuationResponse)
```

---

**Document Version**: 1.1  
**Last Updated**: December 14, 2025  
**Maintained By**: Frontend Team

**Note**: DataCollection UI component removed from both flows. Data sync happens silently in background to maintain unified pipeline consistency.
