# ADR-0001: Committed Parquet snapshot instead of a database

- Status: Accepted
- Date: 2026-10-25

## Context
The pilot covers a fixed historical window (January 2026 decisions): about 17k forecast rows and about 1.5k actual rows. The data never changes after ingestion. The app must deploy on Vercel's serverless runtime, run in Docker, and demo reliably.

## Decision
Ingest once with `make ingest`, validate, and commit `data/snapshot/*.parquet` with `manifest.json` and `quality.json`. The API loads the snapshot into memory at startup. There is no database, and nothing calls Elexon at request time.

## Consequences
- ✅ Deterministic, offline-capable, sub-100 ms queries; zero infrastructure cost; reviewers can reproduce everything.
- ✅ Responses are cacheable at the CDN, keyed by `snapshot_id`.
- ⚠️ New data needs a re-ingest and a redeploy. That's acceptable for a pilot. The production path would be a scheduled ingest writing to object storage or Postgres behind the same `DataStore` interface.
- ⚠️ pyarrow adds bundle weight. Fallback: gzip CSV + pandas, which only changes `store.py` and the ingest writer.
