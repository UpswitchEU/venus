# UpSwitch Valuation Tester - Documentation

**Last Updated**: December 13, 2025

---

## Documentation Index

### Architecture

- **[M&A Workflow Complete Architecture](./architecture/MA_WORKFLOW_COMPLETE.md)**
  - Complete system architecture
  - Component diagrams
  - Data flow diagrams
  - Performance considerations

- **[Session Restoration Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md)**
  - Robustness gaps identified
  - Fail-proof mechanisms implemented
  - Testing requirements

### Strategy

- **[M&A Workflow Strategy](./strategy/MA_WORKFLOW_STRATEGY.md)**
  - Business context
  - User journey
  - Feature prioritization
  - Success metrics

### Implementation

- **[M&A Workflow Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)**
  - What was built
  - Before/after comparison
  - Backend requirements
  - Migration strategy

- **[Implementation Complete](./IMPLEMENTATION_COMPLETE.md)**
  - Executive summary
  - Features delivered
  - Performance metrics
  - Compliance validation

### API

- **[Versioning API Specification](./api/VERSIONING_API_SPEC.md)**
  - Complete API reference
  - Request/response formats
  - Error handling
  - Business logic

### Financial ingestion (positioning)

- **[CSV import positioning](./CSV_IMPORT_POSITIONING.md)** — CSV in Venus is normalization hints / gap-analysis assist, **not** the Hermes→Titan ledger pipeline (integration-first strategy).

---

## Quick Links

### For Developers

- [Frontend Architecture](./architecture/MA_WORKFLOW_COMPLETE.md#frontend-architecture)
- [Backend Architecture](./architecture/MA_WORKFLOW_COMPLETE.md#backend-architecture)
- [API Endpoints](./api/VERSIONING_API_SPEC.md)

### For Product Managers

- [Strategy Overview](./strategy/MA_WORKFLOW_STRATEGY.md)
- [User Journey](./strategy/MA_WORKFLOW_STRATEGY.md#user-journey)
- [Success Metrics](./strategy/MA_WORKFLOW_STRATEGY.md#success-metrics)

### For QA/Testing

- [Testing Strategy](./architecture/MA_WORKFLOW_COMPLETE.md#testing-strategy)
- [Robustness Audit](./analysis/SESSION_RESTORATION_ROBUSTNESS_AUDIT.md)

---

## Getting Started

### Frontend Development

```bash
cd apps/upswitch-valuation-tester
npm install
npm run dev
```

### Backend Development

```bash
cd apps/upswitch-backend
npm install
npm run dev
```

### Database Migrations

```bash
cd apps/upswitch-backend
psql $DATABASE_URL -f database/migrations/25_create_valuation_versions.sql
psql $DATABASE_URL -f database/migrations/26_create_valuation_audit_log.sql
```

---

## Key Concepts

### M&A Workflow

The M&A workflow enables iterative valuation refinement over weeks or months:

1. **Create** → Start new valuation
2. **Save** → Auto-save on changes
3. **Return** → Resume anytime
4. **Edit** → Adjust assumptions
5. **Regenerate** → New version created
6. **Compare** → See what changed

### Version Management

- **Auto-Versioning**: New version created on regeneration with significant changes
- **Version History**: Complete timeline of all versions
- **Version Comparison**: Side-by-side diff view
- **Version Labels**: User-friendly labels (e.g., "Q4 2025 Final")

### Session Robustness

- **Fail-Proof Loading**: Request deduplication, retry, circuit breaker
- **Session Caching**: localStorage cache for offline resilience
- **Data Validation**: Auto-fix common data issues
- **Audit Logging**: Complete operation history

---

## Support

For questions or issues:
- Check [Architecture Documentation](./architecture/MA_WORKFLOW_COMPLETE.md)
- Review [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)
- See [API Specification](./api/VERSIONING_API_SPEC.md)

The M&A workflow enables iterative valuation refinement over weeks or months:

1. **Create** → Start new valuation
2. **Save** → Auto-save on changes
3. **Return** → Resume anytime
4. **Edit** → Adjust assumptions
5. **Regenerate** → New version created
6. **Compare** → See what changed

### Version Management

- **Auto-Versioning**: New version created on regeneration with significant changes
- **Version History**: Complete timeline of all versions
- **Version Comparison**: Side-by-side diff view
- **Version Labels**: User-friendly labels (e.g., "Q4 2025 Final")

### Session Robustness

- **Fail-Proof Loading**: Request deduplication, retry, circuit breaker
- **Session Caching**: localStorage cache for offline resilience
- **Data Validation**: Auto-fix common data issues
- **Audit Logging**: Complete operation history

---

## Support

For questions or issues:
- Check [Architecture Documentation](./architecture/MA_WORKFLOW_COMPLETE.md)
- Review [Implementation Summary](./implementation/MA_WORKFLOW_IMPLEMENTATION_SUMMARY.md)
- See [API Specification](./api/VERSIONING_API_SPEC.md)
