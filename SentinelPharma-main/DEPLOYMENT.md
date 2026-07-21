# SentinelPharma Deployment Guide

This guide deploys SentinelPharma as a Docker Compose stack:

- React client served by Nginx
- Node.js API gateway
- FastAPI AI engine
- MongoDB for users, reports, watchlist, and alerts
- Redis for OTP challenges, token revocation, and cache
- Nginx reverse proxy

## 1. Production Environment

Create a `.env.prod` file on the server. Do not commit it.

```dotenv
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=replace-with-a-long-random-password
AUTH_TOKEN_SECRET=replace-with-at-least-32-random-bytes
GEMINI_API_KEY=optional-cloud-provider-key
```

Generate a token secret:

```bash
openssl rand -hex 32
```

## 2. Verify Compose Configuration

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml config
```

This must succeed before deployment. It should fail if required secrets are missing.

## 3. Build And Start

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

Check service health:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=100 server
docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=100 ai-engine
```

## 4. Smoke Tests

Run these from the host:

```bash
curl -f http://localhost/health
curl -f http://localhost/api
curl -f http://localhost/ready
```

Expected:

- `/health` returns a healthy Nginx response.
- `/api` returns the SentinelPharma API information.
- `/ready` returns `200` only when MongoDB and the AI engine are reachable.

## 5. Domain And HTTPS

Set `server_name` in `nginx/nginx.conf` to your real domain, then add TLS using either:

- a cloud proxy such as Cloudflare, or
- Let's Encrypt certificates mounted into `nginx/ssl`.

Do not expose MongoDB or Redis to the public internet.

## 6. Production Readiness Checks

Before calling the deployment production-ready, verify:

- Users persist after API container restart.
- OTP challenges expire through Redis.
- Watchlist entries and alert read state persist after restart.
- `AUTH_TOKEN_SECRET` remains stable across restarts.
- The AI engine can train or load a GNN artifact.
- Disease-first discovery labels each result as `validated`, `repurposed`, `predicted`, or `fallback`.
- Logs do not print raw secrets or full OTP destinations.

## 7. Updating The GNN Dataset

The seed dataset is:

```text
ai_engine/data/drugbank_seed_kg.csv
```

The provenance file is:

```text
ai_engine/data/drugbank_seed_sources.json
```

For a stronger deployment, replace or expand the seed graph with licensed or public biomedical sources such as DrugBank, ChEMBL, OpenTargets, ClinicalTrials.gov, PubMed, and RCSB PDB. Keep provenance updated whenever triples are added.

After updating data:

```bash
curl -X POST http://localhost/api/research/repurpose/train \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"epochs":120,"learningRate":0.01,"hiddenDim":64,"embeddingDim":64}'
```

## 8. Rollback

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml down
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Volumes preserve MongoDB and Redis data unless explicitly removed.
