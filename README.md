# Ledgerline

A card transaction review desk. Every transaction is scored as it arrives, suspicious ones appear in a live queue with the reasons spelled out, and reviewers approve, block or escalate them. Every decision is written to an audit trail.

Built with React, Node/Express, MongoDB, Redis (BullMQ) and Socket.io.

## What it does

- **Accepts transactions** through `POST /api/transactions` (or the built-in simulator). The call returns immediately; scoring happens in a background job.
- **Scores each transaction 0 to 100** with five transparent rules: many purchases in a minute, an amount far above the account's usual spending, the card used in two countries within 30 minutes, a first-ever country, and risky merchant categories. Scores of 50 and above become alerts; 75 and above are high risk.
- **Explains each alert** in one or two plain sentences. A language model can write the sentence, but it never makes the decision, and a template is used if it is unavailable.
- **Live dashboard.** New scores and alerts stream in over Socket.io. Reviewers approve, block or escalate with an optional note. Escalated alerts can only be closed by an admin.
- **Safe under concurrency.** Two reviewers clicking at once can't both succeed (compare-and-set update). Sending the same transaction twice creates one record (unique `externalId`). A retried job can't create a second alert (unique index on `transactionId`).
- **Audit trail** of every action, visible to admins.
- **Measured quality.** The simulator labels the suspicious patterns it injects, so the dashboard shows what share of flags were genuine and what share of incidents were caught.

## Architecture

```
POST /api/transactions ──► save (status: pending) ──► queue job (Redis / BullMQ)
simulator ────────────────┘                                   │
                                                              ▼
                                   worker: load account history ► scorer (pure function)
                                                              │
                                   save score ──► emit "txn:scored" ──► dashboard
                                   flagged? ──► explain ──► create alert ──► emit "alert:new"

reviewer click ──► PATCH /api/alerts/:id/decision ──► compare-and-set ──► audit log ──► emit "alert:updated"
```

## Folder structure

```
ledgerline/
├── docker-compose.yml           MongoDB + Redis + server + client
├── server/
│   ├── .env.example
│   ├── tests/scorer.test.js     unit tests for every rule
│   └── src/
│       ├── index.js             HTTP + Socket.io + worker bootstrap
│       ├── app.js               Express setup and routes
│       ├── config/              env.js, db.js
│       ├── models/              User, Transaction, Alert, AuditLog
│       ├── middleware/          auth (JWT + roles), errorHandler
│       ├── routes/              auth, transactions, alerts, ops (stats, audit, simulator)
│       └── services/
│           ├── scorer.js        the rules (pure, no I/O)
│           ├── ingest.js        idempotent save + enqueue
│           ├── queue.js         BullMQ queue and Redis connection
│           ├── worker.js        scoring job: score, save, alert, broadcast
│           ├── explain.js       short explanation (model or template)
│           └── simulator.js     traffic generator with labelled incidents
└── client/src/
    ├── api.js, auth.jsx         fetch wrapper with token refresh, auth context
    └── components/              Dashboard, AlertQueue, LiveFeed, Stats, AuditTrail, SimulatorControls, Login
```

## Run it locally

Requirements: Node 20+, Docker.

```bash
# 1. Databases
docker compose up -d mongo redis

# 2. Server
cd server
cp .env.example .env        # set the two JWT secrets
npm install
npm test                    # 10 scorer tests
npm run dev                 # http://localhost:5001

# 3. Client (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5174
```

Register the first account (it becomes admin), then press **Start simulator** in the top bar. Alerts start appearing within a few seconds.

Everything in Docker: `cp server/.env.example server/.env && docker compose up --build` (client on http://localhost:8081).

### Optional: model-written explanations

```
EXPLAIN_PROVIDER=anthropic    # or openai
ANTHROPIC_API_KEY=...
```

Only the transaction's amount, merchant, category, country and the rule results are sent. Never names, emails or card numbers (this system doesn't store any).

## Try the API directly

```bash
curl -X POST http://localhost:5001/api/transactions \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"externalId":"t-1","accountId":"ACC-1001","amount":4200,"merchant":"CoinHub","category":"crypto","country":"US","channel":"online"}'
# send it again: 200 with "duplicate": true, and nothing is queued
```

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/register`, `/login`, `/refresh`, `/logout` | Access token + rotating refresh cookie |
| POST | `/api/transactions` | 202 accepted, 200 if `externalId` was already received |
| GET | `/api/transactions` | Recent scored transactions (`?flagged=true`) |
| GET | `/api/alerts` | Open and escalated by default (`?status=approved,blocked`) |
| PATCH | `/api/alerts/:id/decision` | `{ action: approve \| block \| escalate, note? }` |
| GET | `/api/stats` | Throughput, alert counts, time to decision, precision, incident recall |
| GET | `/api/audit` | Admin only |
| GET/POST | `/api/simulator`, `/simulator/start`, `/simulator/stop` | Start/stop are admin only |

Socket events (server to client): `txn:scored`, `alert:new`, `alert:updated`.

## How the quality numbers are calculated

- **Flags that were real (precision):** among flagged simulator transactions, the share that belong to an injected suspicious pattern.
- **Incidents caught (recall):** among injected incidents, the share where at least one transaction was flagged. A burst of 8 purchases is one incident. The first four can't be flagged by a "5 in a minute" rule, so counting per transaction would understate the system.
- Both are measured on simulated data, which includes a small share of honest large purchases to create realistic false alarms. Say "on simulated data" whenever you quote them.

To change the numbers, adjust a threshold or points value in `scorer.js`, run the simulator for a few minutes, and compare.

## Design decisions (good interview material)

- **Why a queue instead of scoring inside the request?** The sender gets an answer immediately, scoring can retry on failure, and scoring can be scaled separately from the API.
- **Why is the scorer a pure function?** Every rule can be tested without a database. Adding a rule means adding a function and a test.
- **Why rules plus a statistical check, not only a trained model?** Every flag can be explained in plain words, and the sample here has no real labelled data to train on.
- **Why compare-and-set for decisions?** It prevents double decisions without locks.
- **Why only advisory model output?** The model can be slow, wrong or offline. Decisions come from deterministic rules, so behaviour is repeatable and testable.
- **Why unique indexes as the safety net?** They hold even when code paths race or retry.

## Known limitations

- Scoring and the API run in one process. Run the worker separately to scale.
- If the server stops between saving a transaction and queueing its job, that transaction stays `pending`. A periodic sweep that re-queues old pending transactions would fix this.
- History is read from MongoDB per transaction; a cache (Redis) would reduce load at high volume.
- Thresholds are hand-set, not learned.
- Simulated data only; real traffic would need tuning.
- Time-series collections were not used, because the unique `externalId` index is needed.

## Deploy

Frontend on Vercel or Netlify, API on Render or Railway, MongoDB Atlas, and a free Redis (Upstash or Redis Cloud). On a split-domain deployment set `COOKIE_SAMESITE=none`, `CLIENT_URL` to the frontend URL, and `VITE_API_URL` in the client build to the API URL.
