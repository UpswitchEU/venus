# CSV upload in Venus — product / engineering positioning

## What CSV does **today**

When a user completes a CSV-related flow in the manual calculator (e.g. **`CSVUploadCard`** / **`ManualInputPanel`**), the app calls **`handleCSVImportComplete`** in **`ManualLayout`**, which requests **`POST /api/ai/normalize`**.

That route triggers **AI-powered normalization analysis** and **gap-analysis-style suggestions** to help fill or adjust fields in the calculator. It does **not**:

- Parse a full trial balance through **Hermes**
- Produce the same **`FinancialData` + `ImportQuality`** contract as **Yuki/Exact** integrations
- Persist integrated ledger data to Titan the same way as **`YukiSyncService` / `ExactService`** sync

So for accountants and compliance discussions: **CSV today is hints / assistant flow, not the Hermes → Titan ingestion pipeline.**

## Strategic direction

Product priority is **integration-first** (Yuki, Exact, later partnerships). If **CSV-as-ingestion** is requested, it must **converge** on Hermes MAR + Titan persistence + existing ImportQuality AI — see repo doc:

- [`docs/financial-ingestion/CSV_UNIFIED_PIPELINE.md`](../../../docs/financial-ingestion/CSV_UNIFIED_PIPELINE.md)

## UX guidance

Avoid copy that implies “we imported your books from CSV” unless the unified pipeline above is shipped. Prefer terms like **normalization suggestions**, **review suggested mappings**, or **assistant analysis**.
