# Documentation Map

**Complete guide to all M&A Workflow documentation**

**Last Updated**: December 13, 2025

---

## 📚 Documentation Structure

```
docs/
├── README.md                          # Documentation index
├── QUICK_START.md                     # 5-minute overview
├── ARCHITECTURE_INDEX.md              # Architecture docs index
├── DOCUMENTATION_MAP.md               # This file
├── IMPLEMENTATION_STATUS.md           # Current status
│
├── architecture/
│   └── MA_WORKFLOW_COMPLETE.md       # Complete system architecture
│
├── strategy/
│   └── MA_WORKFLOW_STRATEGY.md       # Business strategy & roadmap
│
├── implementation/
│   └── MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md  # What was built
│
├── api/
│   └── VERSIONING_API_SPEC.md        # Complete API reference
│
└── analysis/
    └── SESSION_RESTORATION_ROBUSTNESS_AUDIT.md  # Robustness audit
```

---

## 🎯 By Role

### For Developers

**Start Here**:
1. [Quick Start Guide](./QUICK_START.md) - 5-minute overview
2. [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md) - System design
3. [API Specification](./api/VERSIONING_API_SPEC.md) - API reference

**Deep Dive**:
- [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)
- [Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md)

### For Product Managers

**Start Here**:
1. [Quick Start Guide](./QUICK_START.md) - Feature overview
2. [Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md) - Business context
3. [Implementation Status](./IMPLEMENTATION_STATUS.md) - Current state

**Deep Dive**:
- [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md) - Technical details
- [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)

### For QA/Testing

**Start Here**:
1. [Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md) - Testing requirements
2. [Complete Architecture - Testing](./architecture/MA_WORKFLOW_COMPLETE.md#testing-strategy)
3. [API Specification](./api/VERSIONING_API_SPEC.md) - API testing

### For Architects

**Start Here**:
1. [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md) - Full system design
2. [Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md) - Business context
3. [Backend Implementation](../../upswitch-backend/docs/BACKEND_VERSIONING_IMPLEMENTATION.md)

---

## 📖 By Topic

### Architecture

- **[Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md)**
  - System components
  - Data flow diagrams
  - Performance considerations
  - Security & compliance

### Strategy

- **[Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md)**
  - Business problem
  - Solution vision
  - User journey
  - Success metrics
  - Roadmap

### Implementation

- **[Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)**
  - What was built
  - Files created/modified
  - Before/after comparison

- **[Implementation Status](./IMPLEMENTATION_STATUS.md)**
  - Current status
  - Next steps
  - Feature checklist

### API

- **[API Specification](./api/VERSIONING_API_SPEC.md)**
  - Complete API reference
  - Request/response formats
  - Error handling
  - Business logic

### Versioning

- **[V2 Version and Assets Behavior](./V2_VERSION_AND_ASSETS_BEHAVIOR.md)**
  - What happens when creating V2
  - Version history vs. current session
  - Cache and asset replacement flow

### Analysis

- **[Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md)**
  - Identified gaps
  - Fail-proof mechanisms
  - Testing requirements

---

## 🔗 Cross-References

### Frontend ↔ Backend

- Frontend: [API Specification](./api/VERSIONING_API_SPEC.md)
- Backend: [Backend Implementation](../../upswitch-backend/docs/BACKEND_VERSIONING_IMPLEMENTATION.md)

### Architecture ↔ Implementation

- Architecture: [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md)
- Implementation: [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)

### Strategy ↔ Architecture

- Strategy: [Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md)
- Architecture: [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md)

---

## 📋 Quick Reference

### Key Concepts

- **M&A Workflow**: Iterative valuation refinement over weeks/months
- **Auto-Versioning**: Automatic version creation on regeneration
- **Session Robustness**: Fail-proof session loading
- **Audit Trail**: Compliance-ready operation logging

### Key Files

- **Frontend Store**: `src/store/useVersionHistoryStore.ts`
- **Frontend API**: `src/services/api/version/VersionAPI.ts`
- **Backend Service**: `src/services/valuationVersion.service.ts`
- **Backend Controller**: `src/controllers/valuationVersion.controller.ts`
- **Backend Routes**: `src/routes/valuationVersions.ts`

### Key Endpoints

- `GET /api/valuation-sessions/:reportId/versions` - List versions
- `POST /api/valuation-sessions/:reportId/versions` - Create version
- `GET /api/valuation-sessions/:reportId/versions/compare` - Compare versions

---

## 🆕 Recent Updates

### December 13, 2025

- ✅ Complete architecture documentation
- ✅ Strategy documentation
- ✅ Implementation status
- ✅ Documentation map
- ✅ Quick start guide

---

## 📞 Support

Questions? Check:
- [Documentation Index](./README.md)
- [Architecture Index](./ARCHITECTURE_INDEX.md)
- [Quick Start](./QUICK_START.md)

# Documentation Map

**Complete guide to all M&A Workflow documentation**

**Last Updated**: December 13, 2025

---

## 📚 Documentation Structure

```
docs/
├── README.md                          # Documentation index
├── QUICK_START.md                     # 5-minute overview
├── ARCHITECTURE_INDEX.md              # Architecture docs index
├── DOCUMENTATION_MAP.md               # This file
├── IMPLEMENTATION_STATUS.md           # Current status
│
├── architecture/
│   └── MA_WORKFLOW_COMPLETE.md       # Complete system architecture
│
├── strategy/
│   └── MA_WORKFLOW_STRATEGY.md       # Business strategy & roadmap
│
├── implementation/
│   └── MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md  # What was built
│
├── api/
│   └── VERSIONING_API_SPEC.md        # Complete API reference
│
└── analysis/
    └── SESSION_RESTORATION_ROBUSTNESS_AUDIT.md  # Robustness audit
```

---

## 🎯 By Role

### For Developers

**Start Here**:
1. [Quick Start Guide](./QUICK_START.md) - 5-minute overview
2. [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md) - System design
3. [API Specification](./api/VERSIONING_API_SPEC.md) - API reference

**Deep Dive**:
- [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)
- [Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md)

### For Product Managers

**Start Here**:
1. [Quick Start Guide](./QUICK_START.md) - Feature overview
2. [Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md) - Business context
3. [Implementation Status](./IMPLEMENTATION_STATUS.md) - Current state

**Deep Dive**:
- [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md) - Technical details
- [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)

### For QA/Testing

**Start Here**:
1. [Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md) - Testing requirements
2. [Complete Architecture - Testing](./architecture/MA_WORKFLOW_COMPLETE.md#testing-strategy)
3. [API Specification](./api/VERSIONING_API_SPEC.md) - API testing

### For Architects

**Start Here**:
1. [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md) - Full system design
2. [Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md) - Business context
3. [Backend Implementation](../../upswitch-backend/docs/BACKEND_VERSIONING_IMPLEMENTATION.md)

---

## 📖 By Topic

### Architecture

- **[Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md)**
  - System components
  - Data flow diagrams
  - Performance considerations
  - Security & compliance

### Strategy

- **[Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md)**
  - Business problem
  - Solution vision
  - User journey
  - Success metrics
  - Roadmap

### Implementation

- **[Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)**
  - What was built
  - Files created/modified
  - Before/after comparison

- **[Implementation Status](./IMPLEMENTATION_STATUS.md)**
  - Current status
  - Next steps
  - Feature checklist

### API

- **[API Specification](./api/VERSIONING_API_SPEC.md)**
  - Complete API reference
  - Request/response formats
  - Error handling
  - Business logic

### Versioning

- **[V2 Version and Assets Behavior](./V2_VERSION_AND_ASSETS_BEHAVIOR.md)**
  - What happens when creating V2
  - Version history vs. current session
  - Cache and asset replacement flow

### Analysis

- **[Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md)**
  - Identified gaps
  - Fail-proof mechanisms
  - Testing requirements

---

## 🔗 Cross-References

### Frontend ↔ Backend

- Frontend: [API Specification](./api/VERSIONING_API_SPEC.md)
- Backend: [Backend Implementation](../../upswitch-backend/docs/BACKEND_VERSIONING_IMPLEMENTATION.md)

### Architecture ↔ Implementation

- Architecture: [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md)
- Implementation: [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)

### Strategy ↔ Architecture

- Strategy: [Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md)
- Architecture: [Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md)

---

## 📋 Quick Reference

### Key Concepts

- **M&A Workflow**: Iterative valuation refinement over weeks/months
- **Auto-Versioning**: Automatic version creation on regeneration
- **Session Robustness**: Fail-proof session loading
- **Audit Trail**: Compliance-ready operation logging

### Key Files

- **Frontend Store**: `src/store/useVersionHistoryStore.ts`
- **Frontend API**: `src/services/api/version/VersionAPI.ts`
- **Backend Service**: `src/services/valuationVersion.service.ts`
- **Backend Controller**: `src/controllers/valuationVersion.controller.ts`
- **Backend Routes**: `src/routes/valuationVersions.ts`

### Key Endpoints

- `GET /api/valuation-sessions/:reportId/versions` - List versions
- `POST /api/valuation-sessions/:reportId/versions` - Create version
- `GET /api/valuation-sessions/:reportId/versions/compare` - Compare versions

---

## 🆕 Recent Updates

### December 13, 2025

- ✅ Complete architecture documentation
- ✅ Strategy documentation
- ✅ Implementation status
- ✅ Documentation map
- ✅ Quick start guide

---

## 📞 Support

Questions? Check:
- [Documentation Index](./README.md)
- [Architecture Index](./ARCHITECTURE_INDEX.md)
- [Quick Start](./QUICK_START.md)


