# Audit: Grootboek, NACE, and Business Type Data Flow

**Last audit**: Final verification — all flows confirmed working.

---

## 1. Grootboek (Ledger) Codes

### Storage
- **Titan API**: `apps/titan-api/src/integrations/python-engine/reference-data.controller.ts`
  - Static `BELGIAN_MAR_CODES` array (~80 codes, classes 60x–76x)
  - Endpoint: `GET /api/v2/reference-data/grootboek`
  - Response: `{ success, codes: [{ code, name, category }], total, cached, timestamp }`
  - Redis cache: 7-day TTL, key `reference_data:grootboek`

### Venus Proxy
- **Route**: `apps/venus/app/api/reference/grootboek/route.ts`
- Proxies to Titan `GET /api/v2/reference-data/grootboek`
- Passes through response unchanged

### Venus Consumers

| Component | Fetches API? | Fallback | ledgerAccounts prop |
|-----------|--------------|----------|---------------------|
| **UnifiedNormalizationModal** | Yes | `DEFAULT_LEDGER_ACCOUNTS` | Optional; when empty, uses API → constants |
| **NormalizationEditor** | No | `DEFAULT_LEDGER_ACCOUNTS` | Optional; when empty, uses constants |
| **NormalisationReviewStep** | No | `DEFAULT_LEDGER_ACCOUNTS` | N/A (no prop) |

### Data Flow (Normalisation Popup Modal)
```
User opens modal (ManualLayout or NormalizationHub)
  → UnifiedNormalizationModal mounts
  → useEffect fetches /api/reference/grootboek
  → Venus proxy → Titan /api/v2/reference-data/grootboek
  → On success: setFetchedLedgers(data.codes)
  → availableLedgers = ledgerAccounts || fetchedLedgers || DEFAULT_LEDGER_ACCOUNTS
  → Ledger dropdown shows Titan data (or fallback on API failure)
```

**Status**: OK. Modal fetches from Titan; fallback to shared constants on failure.

---

## 2. NACE Codes and Business Types (Left Panel)

### NACE Sources
- **Titan**: `apps/titan-api/src/business-types/` — NaceService, NaceController
  - `GET /api/v2/nace/search?q=...` — search NACE codes
  - `GET /api/v2/business-types/:id/nace` — NACE for business type
- **KBO registry**: Titan returns `nace_code`, `nace_description` in company search results

### Business Types Source
- **Titan**: `GET /api/v2/business-types/types` (batched)
- **Venus**: `useBusinessTypes()` → `businessTypesApiService.getBusinessTypes()`

### Left Panel (ManualInputPanel) — Implemented

| Field | Component | Source | Notes |
|-------|-----------|--------|------|
| Company / KBO | KBOSearchInput | `registryService.searchCompanies()` | Real KBO via Venus proxy → Titan `/api/v1/registry/search` |
| NACE | From KBO selection | `r.nace_code`, `r.nace_description` | Prefilled when user selects company |
| Business Type | BusinessTypeSearchInput | `useBusinessTypes()` → Titan | Falls back to hardcoded list when API returns empty |

### Fixes Applied
1. **KBOSearchInput**: `searchFn={kboSearchFn}` calls `registryService.searchCompanies()` and maps to `KBOCompany`
2. **BusinessTypeSearchInput**: `types={businessTypesForSearch}` from `useBusinessTypes()`; fallback to default when empty
3. **Registry types**: `CompanySearchResult` extended with `nace_code`, `nace_description`, `kbo_number`, `postal_code`, `city`

### KBO Search Chain
```
KBOSearchInput (searchFn)
  → registryService.searchCompanies(query, 'BE', 15)
  → fetch('/api/registry/search') [Venus proxy]
  → Titan POST /api/v1/registry/search
  → Results with nace_code, nace_description
  → Mapped to KBOCompany, handleCompanySelect prefills form
```
