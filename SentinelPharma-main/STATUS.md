# SentinelPharma Audit Status

Audit date: 2026-10-01  
Scope: repository audit plus approved P0.1-P0.3 implementation. Application and test source was updated; biomedical datasets, trained models, and graph artifacts were not modified or rebuilt.

## Current architecture

```text
React/Vite client (:5173)
  -> Express API gateway (:3001; JWT/auth, reports/watchlist, cache, proxy)
    -> FastAPI AI engine (:8000; agent analysis, evidence retrieval, GNN)
      -> external LLM / PubMed / ClinicalTrials services

Express -> MongoDB (users/reports/watchlist)
Express -> Redis (cache, OTP/revocation)
Nginx -> client + Express in production Compose
```

The canonical browser research route is `POST /api/research` (Express), which calls FastAPI `POST /api/analyze`. Disease-first GNN discovery and source evidence search use separate Express proxy routes. The FastAPI app also contains a separate `/api/orchestrate` path backed by `MasterOrchestrator`, creating two orchestration implementations to reconcile.

## Verified checks

- Client production build: passed (`vite build`; 1,684 modules transformed). It reported stale Browserslist data.
- Server Jest suite: passed with `--runInBand --detectOpenHandles --silent` — 8 suites, 18 tests, 7.856 seconds. No open-handle diagnostic was reported.
- Client Jest suite: passed with `--runInBand --detectOpenHandles --silent` — 5 suites, 8 tests, 25.342 seconds. No open-handle diagnostic was reported.
- Python syntax compilation: passed for `ai_engine/app` (`python -m compileall -q`).
- Python test suite: passed with the configured default command — 63 tests, 54% coverage, 43.64 seconds. No application artifacts were written; evaluation tests use pytest temporary directories.
- Client and server lint: configuration is now present and both commands execute. They currently report pre-existing violations: server 4 errors; client 55 errors and 12 warnings. No application code was changed to suppress or repair them.
- Runtime logs: Express repeatedly failed to connect to local Redis at `localhost:6379`; the app reports degraded cache and disabled OTP login. AI-engine logs show prior services running on ports 8002 and 8003, not the documented default 8000.
- P0.2 validation: FastAPI security/deployment tests passed (11 tests); complete server Jest suite passed (9 suites, 19 tests) with open-handle detection. Docker CLI is not installed in this environment, so an actual `docker compose config`/container startup remains a deployment-host verification step.
- P0.3 validation: complete Python suite passed (68 tests, 54% coverage); complete server suite passed (10 suites, 23 tests); complete client suite passed (6 suites, 14 tests); client production build passed (1,685 modules transformed). The build continues to report stale Browserslist data and large chunk warnings.

## P0.3 evidence/provenance contract (2026-10-01)

- Established evidence contract version `1.0` across FastAPI, Express, and React with four explicit data modes: `SOURCE_BACKED`, `MODEL_PREDICTION`, `DEMO_SYNTHETIC`, and `UNAVAILABLE`.
- Enforced compatible verification states: source records are verified/unverified at the source-identity level, predictions are `MODEL_INFERENCE`, synthetic results are `DEMO_ONLY`, and unavailable results are `NOT_AVAILABLE` with a structured reason.
- Source-backed citation records now require a source identifier or URL and a retrieval timestamp. Express filters incomplete records and model outputs out of citation lists while retaining predictions in their own labelled result channel.
- PubMed and ClinicalTrials.gov adapters preserve source identity, URL, retrieval time, publication metadata, and contract version. Retrieval failures return structured unavailable responses without generated substitutes.
- The existing agent workflow remains available only in explicit demo mode and is visibly labelled in the API, dashboard, recommendation dossier, exports, and generated browser report. Production mode continues to fail closed until source-backed agents are configured.
- Removed hard-coded PMID, NCT, and patent examples from generated reports. Reports now render only traceable backend citations and explicitly state when none are available.
- Disease-first GNN results remain separately labelled model predictions; failed GNN requests return unavailable results and do not activate the legacy heuristic candidate generator.
- Added regression coverage for incompatible provenance states, missing citation provenance, all four browser-visible modes, structured unavailable reasons, and end-to-end preservation through the Express research response.
- No training, online update, dataset download, model write, or graph-artifact build command was run.

## P0 test-tooling update (2026-09-30)

Completed only the approved reproducible-test-tooling scope:

- Added `ai_engine/requirements-dev.txt`, which includes the existing declared runtime/test requirements, and `ai_engine/TESTING.md` with the supported Python 3.11 virtual-environment workflow.
- Created an ignored `ai_engine/.venv` and installed pytest 9.1.1, FastAPI test dependencies, PyTorch 2.14.0, and torch-geometric 2.8.0. `pip check` reports no dependency conflicts.
- Added ESLint 8 classic configurations in `client/.eslintrc.cjs` and `server/.eslintrc.cjs`, using installed plugins and the projects' existing JavaScript/JSX/CommonJS conventions.
- Corrected `ai_engine/pytest.ini` from the ignored INI section `[tool:pytest]` to `[pytest]`, so test paths, coverage, and cache settings now apply. Pytest now uses the new ignored `.pytest_cache_local` directory rather than the pre-existing non-writable cache directory.
- Diagnosed the apparent runner hangs: they were command-window timeouts, not Jest open handles or a deadlocked Python test. The GNN smoke/evaluation tests are CPU-bound and the Python suite needs roughly 44 seconds. Background completion was used only to let the command exceed the shell's 30-second foreground window.
- Did not modify application source, dependency manifests, environment files, datasets, models, graph artifacts, or existing uncommitted changes.

Remaining test-tooling work is limited to addressing the reported lint findings in a separately approved code-quality tranche.

## P0.2 deployment security update (2026-09-30)

- Production Compose now requires and injects the same `INTERNAL_SERVICE_TOKEN` into Express and FastAPI. Missing values fail Compose interpolation before containers start; FastAPI independently returns `401` for every protected route when its configured token is absent or mismatched.
- Redis now requires `REDIS_PASSWORD`, runs with `--requirepass`, and uses an authenticated health check. Express receives the password through Compose and already supplies it to the Redis client.
- Express `/ready` now fails with `503` when Redis is unavailable, even if MongoDB and FastAPI are healthy. Its Compose health check now calls `/ready`, preventing client/Nginx startup from treating a dependency-degraded server as production-ready.
- MongoDB health checks now authenticate with the configured root credentials. The AI engine receives explicit provider/retrieval configuration rather than unused MongoDB/Redis URLs.
- Added deployment configuration regression tests in `ai_engine/tests/test_deployment_config.py` and focused FastAPI/server readiness tests. Updated production environment documentation and server environment examples with the required Redis and internal-service secrets.
- No containers were started, and no data volumes, datasets, model weights, or graph artifacts were changed.

## Remaining lint findings

The lint configurations are intentionally not weakened. These findings require application/test-source cleanup and are outside the approved runner-only scope.

- Server: 4 errors — unused fallback/mock helpers in `researchController.js` and `aiEngineService.js`, plus an unused rate-limiter import and error-handler `next` parameter in `index.js`.
- Client: 55 errors and 12 warnings — primarily unused imports/state/helpers; undefined legacy `process` references in browser/Jest-facing files; missing React mock display names in tests; JSX quote escaping; one conditional-hook violation in `ComprehensiveSummary.jsx`; Hook dependency warnings; and React Fast Refresh export warnings.
- Dependency warning: PyTorch emits one upstream `torch.jit.script` deprecation warning during tests. It does not fail the suite and should be handled in a future dependency/API upgrade tranche, not silenced blindly.

## Priority findings

### P0 blockers

1. **Compose runtime verification remains outstanding.** The checked-in configuration now requires/injects its internal and datastore credentials and is covered by static regression tests, but Docker CLI is unavailable here to run `docker compose config` and a real container readiness check.
2. **Python dependency reproducibility remains incomplete.** The documented isolated environment now works, but Python dependencies are range-based and have no lockfile.
3. **Lint gates now run but do not pass.** The active findings are documented above; repairing them requires a separate source-cleanup approval.
4. **Local Redis is unavailable.** Logs show connection refusal on IPv4 and IPv6 localhost. OTP authentication is explicitly disabled in this degraded state, blocking the normal authenticated user journey unless a pre-existing JWT path is used. Production Compose now fails readiness rather than masking this condition.
5. **Source-backed primary analysis is not yet implemented.** The existing agent workflow is isolated behind explicit demo mode and labelled as synthetic at every rendered/exported boundary. With demo mode disabled, `/api/analyze` fails closed instead of substituting template claims.

### P1 correctness and design risks

1. **Two orchestration paths:** `/api/analyze` and `/api/orchestrate` use different implementations, increasing schema and behavior drift risk.
2. **In-memory request status:** the Express controller uses a process-local map for request/report preview status. It will not survive restart or work across multiple server workers.
3. **Deployment runtime remains unverified:** the checked-in token/provider wiring was repaired in P0.2, but the Docker Compose stack still needs verification on a host with Docker available.
4. **Health semantics are incomplete for a research workflow:** basic health may be green while Redis/authentication or source/model readiness is degraded. `/ready` is the better dependency signal but needs full Compose verification.
5. **Artifact lineage must be audited before scientific claims:** GNN artifacts and evaluations exist, but this audit did not retrain, inspect model weights, or validate lineage/licensing. Prediction UI/report language must remain bounded until that review passes.

### P2 quality and maintainability risks

- Dependency versions are mostly ranges rather than reproducible Python pins/lock data.
- No committed Playwright configuration was observed although the client exposes end-to-end test scripts.
- Root contains accumulated logs; ignored logs are appropriate, but retention/rotation should be defined for deployments.
- Existing worktree contains uncommitted application edits and untracked backup/temp/test files. They predate this audit and were not changed.

## Existing dirty worktree (preserved)

Modified: `ai_engine/app/core/config.py`, `ai_engine/app/services/llm_service.py`, `ai_engine/requirements.txt`, `server/src/controllers/researchController.js`.

Untracked: `ai_engine/app/agents/orchestrator.py.pre_provenance`, `ai_engine/app/agents/orchestrator.py.pre_summary_patch`, `ai_engine/app/services/llm_service.tmp`, and `server/tests/researchController.test.js`.

## End-to-end workflow status

**Not ready for production source-backed research.** P0.3 makes the current boundary provenance-first and prevents synthetic/model output from masquerading as citations, but normal OTP authentication is still blocked by missing local Redis, lint findings remain, container startup is unverified, and the primary multi-agent analysis is intentionally unavailable outside demo mode until source-backed agents are implemented.

## Current approval checkpoint

P0.3 was completed under the current approval. Continue to require explicit approval before model training, dataset changes/downloads, or graph/model artifact generation. The next roadmap tranche is P1.4: align the canonical research request path around source-backed agents and a stable response schema.

## Historical approval checkpoint (superseded)

Await approval before modifying application code, dependencies, environment files, models, datasets, artifacts, or running data/model operations. Recommended first approved tranche: ROADMAP P0.1–P0.3.
