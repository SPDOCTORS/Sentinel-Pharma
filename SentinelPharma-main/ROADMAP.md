# SentinelPharma Repair Roadmap

## Goal

Deliver one auditable, authenticated research workflow: submit a molecule, obtain explicitly-labelled evidence and analysis results, inspect citations and uncertainty, and save/retrieve a report. No model retraining or dataset changes are in scope for this roadmap's first execution phase.

## P0 — unblock trustworthy local execution

1. Establish a reproducible environment.
   - Pin and lock Node and Python dependencies; document the supported OS/runtime matrix.
   - Add an isolated Python environment/bootstrap path that installs `pytest` and all FastAPI/GNN requirements.
   - Add ESLint configuration for both JavaScript services or remove unsupported lint scripts until configured.
   - Acceptance: client build, client tests, server tests/lint, and Python tests run from a clean clone with documented commands.

2. Repair Compose configuration and secret propagation.
   - Pass `INTERNAL_SERVICE_TOKEN` to both `server` and `ai-engine`; ensure it is non-placeholder in production.
   - Pass only required provider/retrieval configuration to `ai-engine` (`GEMINI_*`, NCBI, provider toggles) and reconcile service URLs with Compose networking.
   - Decide whether MongoDB/Redis are required for local development, then provide a supported local profile or fail fast with actionable diagnostics.
   - Acceptance: `docker compose ... config` succeeds; `/ready` is healthy only after MongoDB, Redis, and FastAPI are reachable; protected engine endpoints reject missing/wrong internal tokens.

3. Define the evidence contract.
   - Specify a versioned response schema with `dataMode`, `verificationStatus`, source identifiers/URLs, retrieval time, and unavailable/degraded reasons.
   - Remove or isolate template/synthetic fallback claims from the production workflow; preserve explicit labelling for demo mode.
   - Acceptance: every rendered recommendation/citation is traceable or visibly marked unavailable/simulated.

## P1 — make the primary workflow reliable

4. Align the research request path end to end.
   - Trace client request/response shapes against Express validation/controller output and FastAPI `AnalyzeRequest`/`/api/analyze` behavior.
   - Remove the mismatch between the direct analyze path and the separate `MasterOrchestrator` path, or document one canonical path.
   - Ensure the server's requested agents match implemented, source-backed agents; replace the hard-coded ESG response with an explicit capability or degraded output.
   - Acceptance: an authenticated molecule request returns a stable schema, agent status, provenance, and usable UI rendering.

5. Stabilize state and reporting.
   - Replace or constrain in-memory request status as appropriate for multi-worker/restart deployment.
   - Verify Mongo models/indexes, archive/report ownership, cache behavior, and Redis-down behavior.
   - Acceptance: a completed report persists, is visible only to its owner/sharees, survives server restart, and exports without leaking data.

6. Build integration coverage.
   - Add contract tests between Express and FastAPI plus a Compose-backed smoke test for login, research, PubMed/ClinicalTrials evidence, archive, and read-back.
   - Mock external sources deterministically; add separate opt-in live checks.
   - Acceptance: CI distinguishes unit, contract, integration, and live-source suites.

## P2 — harden scientific and operational readiness

7. Audit GNN readiness without retraining.
   - Inventory artifact lineage, dataset licenses, hashes, split/leakage controls, calibration, and model-to-endpoint compatibility.
   - Surface model version and limitations in candidate responses; reject unknown/incompatible artifacts.
   - Acceptance: every model prediction reports a reproducible artifact and evaluation provenance.

8. Production hardening.
   - Add structured redaction, dependency health/observability, rate-limit tests, backup/restore drills, and deployment CI.
   - Replace broad CORS/dev defaults with environment-specific policy; review authentication/OTP threat handling.
   - Acceptance: staging deployment meets security, monitoring, and rollback checklist.

## Sequencing

Do P0 in order before modifying product behavior. P1 is the first code-change tranche after approval. P2 follows a passing end-to-end workflow and a confirmed evidence contract.
