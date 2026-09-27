# SentinelPharma

SentinelPharma is a multi-service platform for AI-assisted pharmaceutical research and drug repurposing.

## Architecture

The repository contains three primary services:

- **client/**: React + Vite frontend dashboard
- **server/**: Node.js + Express API gateway and orchestration layer
- **ai_engine/**: FastAPI multi-agent AI engine

Default local ports:

- Frontend: `http://localhost:5173` (or the Vite-assigned port)
- Server API: `http://localhost:3001`
- AI Engine: `http://localhost:8000`

## Prerequisites

- Node.js 18+
- npm
- Python 3.11+
- pip

## Environment Setup

The canonical local topology is client `5173`, Express `3001`, and FastAPI `8000`.
FastAPI is an internal service in production: do not publish port 8000. Configure the same
`INTERNAL_SERVICE_TOKEN` in `server/.env` and `ai_engine/.env`; Express sends it to FastAPI.
For source-backed PubMed retrieval, set `NCBI_EMAIL` and optionally `NCBI_API_KEY` only in
`ai_engine/.env`. The browser never receives either value. `PUBMED_MAX_RESULTS` defaults to 50.
ClinicalTrials.gov uses its official public v2 API. Its timeout and result cap are controlled by
`CLINICAL_TRIALS_TIMEOUT_SECONDS` and `CLINICAL_TRIALS_MAX_RESULTS` in `ai_engine/.env`.

### 1) Server

From `server/`, create `.env` from `.env.example` and adjust values as needed:

```bash
cp .env.example .env
```

### 2) Client

`client/.env` should contain:

```dotenv
VITE_API_URL=http://localhost:3001
```

### 3) AI Engine

Configure `ai_engine/.env` for your model providers (Gemini/Ollama) and runtime options.

## Installation

Install dependencies in each service directory:

```bash
# client
cd client && npm install

# server
cd ../server && npm install

# ai_engine
cd ../ai_engine && pip install -r requirements.txt
```

## Run Locally

Start each service in a separate terminal.

### Terminal 1: AI Engine

```bash
cd ai_engine
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 2: Server

```bash
cd server
npm run dev
```

### Terminal 3: Client

```bash
cd client
npm run dev
```

Open the frontend URL shown by Vite (typically `http://localhost:5173`).

## Docker (AI Engine)

The AI engine includes a Dockerfile:

```bash
cd ai_engine
docker build -t sentinelpharma-ai .
docker run --rm -p 8000:8000 sentinelpharma-ai
```

## Useful Endpoints

- AI Engine health: `GET /health` → `http://localhost:8000/health`
- AI Engine docs: `http://localhost:8000/docs`
- Server health (if enabled in routes): `http://localhost:3001`

## Repository Structure

```text
SentinelPharma/
├── ai_engine/
├── client/
├── server/
├── start.ps1
└── README.md
```
