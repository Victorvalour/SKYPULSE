# SkyPulse — Airline Route Change & Capacity Intelligence

[![MCP](https://img.shields.io/badge/MCP-Query%20Mode-%230066cc)](https://contextprotocol.ai)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://typescriptlang.org)
[![Railway](https://img.shields.io/badge/Deploy-Railway-purple)](https://railway.app)

SkyPulse is a **Query-mode MCP server** ($0.10/response) that unbundles route-level schedule change and capacity intelligence from OAG Schedules Analyser and Cirium Diio Mi — making it available through the Context Protocol marketplace.

> **Tier A Grant Approved** | US domestic + selected US-international routes at launch

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Clients                               │
│            (Claude, GPT, custom AI agents)                       │
└─────────────────────┬───────────────────────────────────────────┘
                       │  MCP / stdio transport
┌─────────────────────▼───────────────────────────────────────────┐
│                   SkyPulse MCP Server                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    5 MCP Tools                            │   │
│  │  route_capacity_change  │  new_route_launches             │   │
│  │  frequency_losers       │  capacity_driver_analysis       │   │
│  │  carrier_capacity_ranking                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│  ┌────────────┐   ┌───────▼──────┐   ┌──────────────────────┐  │
│  │   Redis    │   │  PostgreSQL  │   │   Cron Scheduler      │  │
│  │   Cache    │◄──│   Database   │◄──│  (T-100 + releases)   │  │
│  │  (ioredis) │   │   (pg pool)  │   │  (node-cron)          │  │
│  └────────────┘   └──────────────┘   └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           ▲
              ┌────────────┴─────────────┐
              │      Data Sources         │
              │  DOT/BTS T-100 CSV        │
              │  FAA OPSNET/ASPM          │
              │  Airline press releases   │
              └───────────────────────────┘
```

---

## Prerequisites

- **Node.js** 18 or higher
- **PostgreSQL** 15 or higher
- **Redis** 7 or higher
- npm 9+

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/Victorvalour/SKYPULSE.git
cd SKYPULSE
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your database and Redis connection strings
```

### 3. Run migrations

```bash
npm run migrate
```

This applies `src/db/migrations/001_initial_schema.sql` and creates all tables and indexes.

### 4. Seed reference data

```bash
npm run seed
```

Loads ~100 US airports, ~50 carriers, and ~30 aircraft types.

### 5. Ingest T-100 data (optional for development)

```bash
npm run ingest:t100
```

Fetches the most recent available T-100 period from BTS (approximately 4 months ago due to reporting lag).

### 6. Run locally

```bash
npm run dev
```

The MCP server listens on **stdio transport** (standard input/output), which is the MCP standard for local tool invocation.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `PORT` | ❌ | Reserved for future HTTP transport (MCP currently uses stdio) |
| `CTX_API_KEY` | ❌ | Context Protocol marketplace API key (required when registering on the CTX marketplace) |
| `NODE_ENV` | ✅ | `development` or `production` |
| `LOG_LEVEL` | ❌ | `debug`, `info`, `warn`, `error` (default: `info`) |
| `ANNOUNCEMENT_FEED_URL` | ❌ | JSON feed URL for route announcements |

---

## MCP Tool Reference

All tool responses include these **freshness metadata fields** (grant reviewer requirement):

| Field | Description |
|---|---|
| `as_of` | ISO 8601 timestamp when the answer was computed |
| `comparison_period` | Time windows being compared (e.g., "2025-Q3 vs 2025-Q2") |
| `source_refs` | Array of data sources with vintage |
| `confidence` | 0–1 confidence score |
| `known_unknowns` | Explicit data gaps |
| `data_freshness` | Human-readable label, e.g., "Source: DOT T-100 Q3 2025 (published Jan 2026) + Press Releases through Apr 2026" |

---

### `route_capacity_change`

Query route-level capacity and frequency change for a specific airport pair.

**Input:**
```json
{
  "origin": "JFK",
  "destination": "LAX",
  "days_back": 365
}
```

**Output:**
```json
{
  "origin": "JFK",
  "destination": "LAX",
  "changes": [
    {
      "carrier": "AA",
      "comparison_period": "2025-Q3 vs 2025-Q2",
      "change_type": "growth",
      "prior_frequency": 420,
      "current_frequency": 462,
      "frequency_change_abs": 42,
      "frequency_change_pct": 10.0,
      "prior_inferred_seats": 79380,
      "current_inferred_seats": 87318,
      "capacity_change_abs": 7938,
      "capacity_change_pct": 10.0,
      "aircraft_type_mix_prior": { "B738": 420 },
      "aircraft_type_mix_current": { "B738": 420, "A321": 42 },
      "confidence": 0.85,
      "known_unknowns": null,
      "source_refs": [{ "source": "DOT T-100", "vintage": "Q3 2025" }]
    }
  ],
  "as_of": "2026-04-16T12:00:00.000Z",
  "comparison_period": "2025-Q3 vs 2025-Q2",
  "source_refs": [...],
  "confidence": 0.85,
  "known_unknowns": "Coverage limited to ingested T-100 periods (3-6 month lag)",
  "data_freshness": "Source: DOT T-100 (3-6 month lag) + Press Releases through Apr 2026 — as of 2026-04-16T12:00:00.000Z"
}
```

---

### `new_route_launches`

Detect new route launches and service resumptions at a given airport.

**Input:**
```json
{
  "airport": "ORD",
  "period": "2025-Q3"
}
```

**Output:**
```json
{
  "airport": "ORD",
  "period": "2025-Q3",
  "routes": [
    {
      "carrier": "WN",
      "origin": "ORD",
      "destination": "BNA",
      "change_type": "launch",
      "comparison_period": "2025-Q3 vs 2025-Q2",
      "current_frequency": 91,
      "current_inferred_seats": 17199,
      "effective_date": "2025-07-01T00:00:00.000Z",
      "confidence": 0.8,
      "source_refs": [...]
    }
  ],
  "as_of": "2026-04-16T12:00:00.000Z",
  ...
}
```

---

### `frequency_losers`

Rank routes losing the most frequency, ordered by percentage decline.

**Input:**
```json
{
  "market": "ATL",
  "period": "2025-Q3"
}
```

**Output:**
```json
{
  "market": "ATL",
  "period": "2025-Q3",
  "losers": [
    {
      "origin": "ATL",
      "destination": "CVG",
      "carrier": "DL",
      "comparison_period": "2025-Q3 vs 2025-Q2",
      "frequency_change_pct": -28.5,
      "frequency_change_abs": -26,
      "prior_frequency": 91,
      "current_frequency": 65,
      "confidence": 0.75
    }
  ],
  "as_of": "2026-04-16T12:00:00.000Z",
  ...
}
```

---

### `capacity_driver_analysis`

Determine whether capacity change is frequency-driven or gauge-driven.

**Input:**
```json
{
  "origin": "SFO",
  "destination": "ORD",
  "carrier": "UA"
}
```

**Output:**
```json
{
  "origin": "SFO",
  "destination": "ORD",
  "carrier": "UA",
  "analysis": [
    {
      "carrier": "UA",
      "comparison_period": "2025-Q3 vs 2025-Q2",
      "driver": "gauge_driven",
      "frequency_change_pct": 2.1,
      "capacity_change_pct": 14.3,
      "aircraft_type_mix_prior": { "B738": 84 },
      "aircraft_type_mix_current": { "B789": 91 },
      "confidence": 0.9,
      "known_unknowns": null
    }
  ],
  "as_of": "2026-04-16T12:00:00.000Z",
  ...
}
```

---

### `carrier_capacity_ranking`

Rank carriers by capacity change in a market.

**Input:**
```json
{
  "market": "DFW",
  "aircraft_category": "narrowbody",
  "period": "2025-Q3"
}
```

**Output:**
```json
{
  "market": "DFW",
  "aircraft_category": "narrowbody",
  "period": "2025-Q3",
  "ranking": [
    {
      "rank": 1,
      "carrier": "AA",
      "total_capacity_change_abs": 142560,
      "total_capacity_change_pct": 8.4,
      "total_current_seats": 1838160,
      "total_prior_seats": 1695600,
      "routes_gained": 12,
      "routes_lost": 2,
      "routes_unchanged": 45
    }
  ],
  "as_of": "2026-04-16T12:00:00.000Z",
  ...
}
```

---

## Data Freshness

SkyPulse uses **pre-ingested** data — no live scraping at query time. This ensures:

- Sub-5s response times for single queries
- Sub-15s for comparison queries
- No external API dependencies at query time

### Source lag

| Source | Typical Lag | Coverage |
|---|---|---|
| DOT/BTS T-100 Segment | 3–6 months | US domestic + US-international |
| FAA OPSNET | 1–2 months | US airport operations (supplementary) |
| Airline press releases | 0–7 days | Forward-looking launches/suspensions |

Every tool response includes `data_freshness` explicitly labeling the source lag so consumers understand the temporal limitations.

---

## Cron Job Schedule

| Schedule | Job | Description |
|---|---|---|
| Every Sunday 02:00 UTC | T-100 ingestion | Fetches the latest available T-100 period from BTS, upserts route snapshots, recomputes changes, invalidates cache |
| Every day 06:00 UTC | Announcement scan | Fetches configured press release feed, inserts new route announcements, invalidates cache |

---

## Railway Deployment

### 1. Create a new Railway project

```bash
railway init
```

### 2. Provision add-ons

In the Railway dashboard, add:
- **PostgreSQL** plugin
- **Redis** plugin

Railway automatically sets `DATABASE_URL` and `REDIS_URL`.

### 3. Set environment variables

```bash
railway variables set CTX_API_KEY=your_key
railway variables set NODE_ENV=production
railway variables set LOG_LEVEL=info
```

### 4. Deploy

```bash
railway up
```

Railway uses `railway.toml` to build (`npm run build`) and start (`npm start`).

### 5. Run migrations on Railway

```bash
railway run npm run migrate
railway run npm run seed
```

---

## Project Structure

```
SKYPULSE/
├── src/
│   ├── index.ts                    # MCP server entry point
│   ├── server.ts                   # MCP server setup (tool registry)
│   ├── tools/
│   │   ├── routeChange.ts          # route_capacity_change tool
│   │   ├── capacityAnalysis.ts     # capacity_driver_analysis tool
│   │   ├── routeLaunches.ts        # new_route_launches tool
│   │   ├── carrierComparison.ts    # frequency_losers tool
│   │   └── marketLeaderboard.ts    # carrier_capacity_ranking tool
│   ├── ingestion/
│   │   ├── dotT100.ts              # DOT/BTS T-100 ingestion
│   │   ├── faaOpsnet.ts            # FAA OPSNET/ASPM ingestion
│   │   ├── announcements.ts        # Press release ingestion
│   │   └── aircraftReference.ts    # Aircraft config sync
│   ├── normalization/
│   │   ├── airportCodes.ts         # IATA airport code normalization
│   │   ├── carrierCodes.ts         # Carrier code normalization
│   │   ├── aircraftTypes.ts        # Aircraft type + seat inference
│   │   ├── changeDetection.ts      # Route change classification
│   │   └── confidenceScoring.ts    # Evidence confidence scoring
│   ├── db/
│   │   ├── connection.ts           # PostgreSQL connection pool
│   │   ├── migrations/
│   │   │   └── 001_initial_schema.sql
│   │   ├── queries.ts              # Query builders
│   │   ├── migrate.ts              # Migration runner
│   │   └── seed.ts                 # Seed data
│   ├── cache/
│   │   └── redis.ts                # Redis client + getOrSet helper
│   ├── cron/
│   │   └── scheduler.ts            # Cron job definitions
│   ├── types/
│   │   └── index.ts                # Shared TypeScript types
│   └── utils/
│       ├── freshness.ts            # Freshness metadata helpers
│       └── logger.ts               # Structured JSON logger
├── package.json
├── tsconfig.json
├── .env.example
├── Procfile
├── railway.toml
└── README.md
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Install dependencies: `npm install`
4. Make changes with TypeScript strict mode
5. Build: `npm run build`
6. Submit a pull request

### Code style

- TypeScript strict mode throughout (`noImplicitAny`, `noUnusedLocals`, etc.)
- Structured JSON logging via `logger.*`
- Every tool response **must** include the freshness metadata block
- No request-time scraping — all data pre-ingested

---

## License

MIT
