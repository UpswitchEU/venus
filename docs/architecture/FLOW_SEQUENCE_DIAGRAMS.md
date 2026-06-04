# Flow Sequence Diagrams

**Purpose**: Visual sequence diagrams for all user flows  
**Last Updated**: January 2025

---

## Overview

This document provides detailed sequence diagrams for all user flows in the valuation tester application, showing the complete interaction between components, stores, and backend services.

---

## Flow 1: Home → Manual Flow → Report

### Complete Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant HomePage
    participant Router
    participant ValuationReport
    participant ValuationSessionManager
    participant ValuationFlowSelector
    participant ValuationFlow
    participant ManualLayout
    participant ValuationForm
    participant useValuationFormStore
    participant useValuationSessionStore
    participant buildValuationRequest
    participant ValuationAPI
    participant Backend (Python)
    participant useValuationResultsStore
    participant ReportPanel

    User->>HomePage: Enter query, select "manual"
    HomePage->>Router: Navigate to /reports/[id]?flow=manual
    Router->>ValuationReport: Render with reportId
    ValuationReport->>ValuationSessionManager: Initialize session
    ValuationSessionManager->>useValuationSessionStore: initializeSession(reportId, 'manual')
    useValuationSessionStore->>Backend: GET /api/valuation-sessions/[id]
    Backend-->>useValuationSessionStore: Session data
    useValuationSessionStore-->>ValuationSessionManager: Session initialized
    ValuationSessionManager->>ValuationFlowSelector: Pass session, stage='data-entry'
    ValuationFlowSelector->>ValuationFlow: Route to flowType='manual'
    ValuationFlow->>ManualLayout: Lazy load and render
    ManualLayout->>ValuationForm: Render in left panel
    ManualLayout->>ReportPanel: Render in right panel (empty)
    ValuationForm->>FormSections: Render BasicInformationSection, etc.
    User->>FormSections: Fill form fields
    FormSections->>useValuationFormStore: updateFormData()
    useValuationFormStore->>useValuationFormStore: Auto-save to session
    useValuationFormStore->>useValuationSessionStore: syncFromManualForm()
    useValuationSessionStore->>Backend: PUT /api/valuation-sessions/[id]
    Backend-->>useValuationSessionStore: Session updated
    User->>ValuationForm: Submit form
    ValuationForm->>buildValuationRequest: Build request from formData
    buildValuationRequest->>buildValuationRequest: Normalize data (clamp, validate, defaults)
    buildValuationRequest-->>ValuationForm: ValuationRequest
    ValuationForm->>useValuationApiStore: calculateValuation(request)
    useValuationApiStore->>ValuationAPI: calculateValuationUnified(request)
    ValuationAPI->>Backend: POST /api/valuation/calculate-unified
    Backend->>Backend: Calculate valuation (Python ValuationIQ)
    Backend->>Backend: Generate html_report
    Backend->>Backend: Generate info_tab_html
    Backend-->>ValuationAPI: ValuationResponse
    ValuationAPI-->>useValuationApiStore: ValuationResponse
    useValuationApiStore->>useValuationResultsStore: setResult(response)
    useValuationResultsStore->>ReportPanel: Update result
    ReportPanel->>User: Display report (Preview/Source/Info tabs)
    User->>ReportPanel: View report, download PDF
    ReportPanel->>Backend: GET /api/valuations/:id/pdf/download
    Backend->>Backend: Resolve or regenerate fresh report-scoped PDF
    Backend-->>ReportPanel: Validated PDF blob
    ReportPanel->>User: Download PDF
```

### Key Components

1. **HomePage**: Entry point, query input
2. **ValuationReport**: Main container, session initialization
3. **ValuationSessionManager**: Session lifecycle management
4. **ManualLayout**: 2-panel layout (form + report)
5. **ValuationForm**: Form inputs, validation
6. **ReportPanel**: Report display (Preview/Source/Info tabs)

---

## Flow 2: Home → Conversational Flow → Report

### Complete Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant HomePage
    participant Router
    participant ValuationReport
    participant ValuationSessionManager
    participant CreditGuard
    participant guestCreditService
    participant ValuationFlowSelector
    participant ValuationFlow
    participant ConversationalLayout
    participant ConversationPanel
    participant StreamingChat
    participant ConversationContext
    participant StreamingManager
    participant Backend (Python)
    participant useValuationResultsStore
    participant ReportPanel

    User->>HomePage: Enter query, select "conversational"
    HomePage->>Router: Navigate to /reports/[id]?flow=conversational
    Router->>ValuationReport: Render with reportId
    ValuationReport->>ValuationSessionManager: Initialize session
    ValuationSessionManager->>useValuationSessionStore: initializeSession(reportId, 'conversational')
    useValuationSessionStore->>Backend: GET /api/valuation-sessions/[id]
    Backend-->>useValuationSessionStore: Session data
    ValuationSessionManager->>CreditGuard: Check credits (guest users)
    CreditGuard->>guestCreditService: getCredits()
    guestCreditService-->>CreditGuard: Credits remaining
    alt Guest user with credits
        CreditGuard->>guestCreditService: useCredit()
        guestCreditService-->>CreditGuard: Credit deducted
        CreditGuard->>ValuationFlowSelector: Allow access
    else Guest user without credits
        CreditGuard->>User: Show out-of-credits modal
        CreditGuard->>ValuationFlowSelector: Block access
    end
    ValuationFlowSelector->>ValuationFlow: Route to flowType='conversational'
    ValuationFlow->>ConversationalLayout: Lazy load and render
    ConversationalLayout->>ConversationPanel: Render in left panel
    ConversationalLayout->>ReportPanel: Render in right panel (empty)
    ConversationPanel->>StreamingChat: Initialize chat
    StreamingChat->>ConversationContext: Initialize context
    StreamingChat->>useConversationRestoration: Restore conversation
    useConversationRestoration->>Backend: GET /api/conversations/[id]
    Backend-->>useConversationRestoration: Messages, pythonSessionId
    useConversationRestoration->>ConversationContext: setMessages(), setPythonSessionId()
    User->>StreamingChat: Send message
    StreamingChat->>StreamingManager: startStreaming(sessionId, message)
    StreamingManager->>Backend: POST /api/chat/stream (SSE)
    Backend->>Backend: Process message (Python)
    Backend->>Backend: Extract data, generate response
    Backend-->>StreamingManager: SSE stream (message chunks, data updates)
    StreamingManager->>ConversationContext: Update messages, collected data
    ConversationContext->>StreamingChat: Update UI
    StreamingChat->>User: Display AI response
    Backend->>Backend: Calculate valuation when ready
    Backend->>Backend: Generate html_report, info_tab_html
    Backend-->>StreamingManager: SSE event: valuation_complete
    StreamingManager->>ConversationContext: setValuationResult()
    ConversationContext->>useValuationResultsStore: setResult(response)
    useValuationResultsStore->>ReportPanel: Update result
    ReportPanel->>User: Display report (Preview/Source/Info tabs)
    User->>ReportPanel: View report, download PDF
    ReportPanel->>Backend: GET /api/valuations/:id/pdf/download
    Backend->>Backend: Resolve or regenerate fresh report-scoped PDF
    Backend-->>ReportPanel: Validated PDF blob
    ReportPanel->>User: Download PDF
```

### Key Components

1. **CreditGuard**: Credit checking for guest users
2. **ConversationalLayout**: 2-panel layout (chat + report)
3. **ConversationPanel**: Chat interface wrapper
4. **StreamingChat**: Chat orchestrator
5. **StreamingManager**: SSE stream management
6. **ConversationContext**: Conversation state management

---

## Flow 3: Session Restoration

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant ConversationalLayout
    participant useConversationRestoration
    participant Backend (Python)
    participant ConversationContext
    participant StreamingChat

    User->>ConversationalLayout: Navigate to report page
    ConversationalLayout->>useConversationRestoration: restore()
    useConversationRestoration->>Backend: GET /api/conversations/[id]
    alt Conversation exists
        Backend-->>useConversationRestoration: Messages, pythonSessionId
        useConversationRestoration->>ConversationContext: setMessages(messages)
        useConversationRestoration->>ConversationContext: setPythonSessionId(id)
        ConversationContext->>StreamingChat: Update UI with messages
        StreamingChat->>User: Display restored conversation
    else No conversation
        useConversationRestoration->>ConversationContext: setMessages([])
        ConversationContext->>StreamingChat: Show empty chat
        StreamingChat->>User: Ready for new conversation
    end
```

---

## Flow 4: PDF Download

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant ReportPanel
    participant ValuationToolbar
    participant UsePdfGeneration
    participant Venus BFF
    participant Titan API
    participant Storage
    participant Browser

    User->>ReportPanel: Click download PDF button
    ReportPanel->>ValuationToolbar: handleDownload()
    ValuationToolbar->>UsePdfGeneration: downloadPdf(reportId)
    UsePdfGeneration->>Venus BFF: GET /api/valuations/:id/pdf/download
    Venus BFF->>Titan API: GET /api/v2/valuations/reports/:id/pdf
    alt no fresh PDF URL or storage fetch fails
        Venus BFF->>Titan API: POST /api/v2/valuations/reports/:id/pdf
    end
    Titan API-->>Venus BFF: Fresh signed PDF URL
    Venus BFF->>Storage: Fetch PDF bytes
    Storage-->>Venus BFF: application/pdf
    Venus BFF-->>UsePdfGeneration: Validated PDF blob
    UsePdfGeneration->>Browser: Create blob URL
    Browser->>User: Download PDF file
```

---

## Flow 5: Flow Switching (Manual ↔ Conversational)

### Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant ManualLayout
    participant useValuationSessionStore
    participant Backend
    participant ConversationalLayout

    User->>ManualLayout: Switch to conversational flow
    ManualLayout->>useValuationSessionStore: switchView('conversational')
    useValuationSessionStore->>useValuationSessionStore: Optimistic update (local state)
    useValuationSessionStore->>Backend: PUT /api/valuation-sessions/[id] (switch view)
    Backend-->>useValuationSessionStore: Session updated
    useValuationSessionStore->>ConversationalLayout: Re-render with new view
    ConversationalLayout->>useConversationRestoration: Restore conversation
    useConversationRestoration->>Backend: GET /api/conversations/[id]
    Backend-->>useConversationRestoration: Messages (if exists)
    ConversationalLayout->>User: Display conversational interface
```

---

## Data Flow Architecture

### Manual Flow Data Flow

```
User Input (Form Fields)
    ↓
ValuationForm
    ↓
useValuationFormStore (Form State)
    ↓
useValuationSessionStore (Session Sync)
    ↓
Backend API (Session Persistence)
    ↓
buildValuationRequest (Data Transformation)
    ↓
ValuationAPI (API Call)
    ↓
Python Backend (Calculation)
    ↓
ValuationResponse (HTML Reports)
    ↓
useValuationResultsStore (Results State)
    ↓
ReportPanel (Display)
```

### Conversational Flow Data Flow

```
User Message
    ↓
StreamingChat
    ↓
StreamingManager (SSE Stream)
    ↓
Python Backend (AI Processing)
    ↓
SSE Events (Message Chunks, Data Updates)
    ↓
ConversationContext (State Management)
    ↓
StreamingChat (UI Update)
    ↓
Python Backend (Valuation Calculation)
    ↓
ValuationResponse (HTML Reports)
    ↓
useValuationResultsStore (Results State)
    ↓
ReportPanel (Display)
```

---

## Error Handling Flow

### Sequence Diagram

```mermaid
sequenceDiagram
    participant Component
    participant API Call
    participant errorConverter
    participant ErrorHandler
    participant User

    Component->>API Call: Make request
    API Call->>Backend: HTTP request
    alt Network Error
        Backend-->>API Call: Network error (no response)
        API Call->>errorConverter: convertToApplicationError(error)
        errorConverter->>errorConverter: Detect network error
        errorConverter-->>API Call: NetworkError instance
        API Call->>ErrorHandler: handle(error)
        ErrorHandler->>ErrorHandler: Determine retry strategy
        ErrorHandler->>API Call: Retry with backoff
        API Call->>Backend: Retry request
    else Validation Error
        Backend-->>API Call: 400 Bad Request
        API Call->>errorConverter: convertToApplicationError(error)
        errorConverter-->>API Call: ValidationError instance
        API Call->>ErrorHandler: handle(error)
        ErrorHandler->>User: Show validation message
    else Server Error
        Backend-->>API Call: 500 Internal Server Error
        API Call->>errorConverter: convertToApplicationError(error)
        errorConverter-->>API Call: ServerError instance
        API Call->>ErrorHandler: handle(error)
        ErrorHandler->>API Call: Retry with backoff
    end
```

---

## State Management Flow

### Store Interaction

```mermaid
graph TD
    A[User Action] --> B[Component]
    B --> C{Store Type}
    C -->|Form Data| D[useValuationFormStore]
    C -->|Session Data| E[useValuationSessionStore]
    C -->|Results| F[useValuationResultsStore]
    C -->|API State| G[useValuationApiStore]
    D --> H[Backend Sync]
    E --> H
    F --> I[UI Update]
    G --> I
    H --> J[Backend API]
    J --> K[Python Backend]
    K --> L[Response]
    L --> F
    L --> I
```

---

## Component Hierarchy

### Manual Flow

```
ValuationReport
  └── ValuationSessionManager
      └── ValuationFlowSelector
          └── ValuationFlow
              └── ManualLayout
                  ├── ValuationToolbar
                  ├── ValuationForm (Left Panel)
                  │   ├── BasicInformationSection
                  │   ├── FinancialMetricsSection
                  │   └── ...
                  └── ReportPanel (Right Panel)
                      ├── Preview Tab (Results)
                      ├── Source Tab (HTMLView)
                      └── Info Tab (ValuationInfoPanel)
```

### Conversational Flow

```
ValuationReport
  └── ValuationSessionManager
      └── CreditGuard
          └── ValuationFlowSelector
              └── ValuationFlow
                  └── ConversationalLayout
                      ├── ValuationToolbar
                      ├── ConversationPanel (Left Panel)
                      │   └── StreamingChat
                      │       ├── MessagesList
                      │       └── ChatInputForm
                      └── ReportPanel (Right Panel)
                          ├── Preview Tab (Results)
                          ├── Source Tab (HTMLView)
                          └── Info Tab (ValuationInfoPanel)
```

---

## Related Documentation

- [COMPLETE_FLOW_DOCUMENTATION.md](./COMPLETE_FLOW_DOCUMENTATION.md) - Detailed flow documentation
- [DATA_FLOW.md](./DATA_FLOW.md) - Data flow architecture
- [SESSION_RESTORATION_ARCHITECTURE.md](./SESSION_RESTORATION_ARCHITECTURE.md) - Session restoration details

---

**Last Updated**: January 2025  
**Maintainer**: Frontend Team
