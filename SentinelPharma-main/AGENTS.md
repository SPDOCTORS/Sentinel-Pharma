# SentinelPharma Agent Guidance

## Scope and safety

- Treat SentinelPharma as research-support software, not a clinical decision system.
- Do not present generated, synthetic, seeded, model-ranked, or template-derived material as clinical validation, real-world evidence, regulatory advice, or patient-specific guidance.
- Preserve provenance, source URLs/identifiers, retrieval timestamps, data mode, and verification status through every API boundary and into reports.
- Keep credentials in service-local `.env` files only. Never log, return, or commit secrets, access tokens, raw internal documents, or protected health information.

## Repository topology

- `client/`: React/Vite browser application; it must call Express only.
- `server/`: Express authenticated API gateway, persistence boundary, and FastAPI proxy.
- `ai_engine/`: FastAPI orchestration, evidence retrieval, and GNN/candidate services.
- The public path is browser -> Express (`:3001`) -> FastAPI (`:8000`). FastAPI must remain internal in deployed environments.

## Change rules

- Make small, reviewable changes; do not overwrite unrelated dirty-worktree changes.
- Add or update focused tests for every behavior change and run the relevant service test command before handoff.
- Do not retrain models, alter `ai_engine/data/`, mutate `ai_engine/artifacts/`, or download biomedical datasets unless the user explicitly authorizes it.
- Treat GNN artifacts as versioned evidence inputs: record dataset/version/hash, split strategy, seed, metrics, and generation time.
- Avoid fallback facts. If a source or model is unavailable, return a structured unavailable/degraded result rather than fabricated citations, metrics, or recommendations.

## API and security contracts

- Validate inputs at Express and FastAPI boundaries; keep browser-facing authorization at Express.
- All Express-to-FastAPI non-health calls must use the shared `X-Internal-Service-Token`; deployment configuration must inject the same non-placeholder value into both services.
- Preserve request IDs across client, server, and engine logs/responses.
- Never expose model-training, online-update, or internal-ingestion endpoints to unprivileged users.

## Quality gate

- JavaScript: `npm test -- --runInBand`, then lint once an ESLint config exists.
- Python: install the declared test requirements in an isolated environment, then run `python -m pytest -q`.
- An end-to-end workflow is ready only when authenticated research, evidence retrieval, report persistence, and degraded dependency behavior are exercised against a real local or Compose stack.
