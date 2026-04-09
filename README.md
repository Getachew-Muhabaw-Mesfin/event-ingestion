# Event Ingestion Service

> Tenant-aware event ingestion and async processing system built with **NestJS**, **PostgreSQL** (Prisma), and **Redis** (BullMQ).

---

## Table of Contents

- [Architecture](#architecture)
  - [Request Flow](#request-flow)
  - [Module Structure](#module-structure)
- [Key Design Decisions](#key-design-decisions)
- [Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment](#environment)
  - [Database](#database)
  - [Running the Server](#running-the-server)
- [Testing the Endpoints](#testing-the-endpoints)
  - [Option A  Postman](#option-a--postman)
  - [Option B  REST Client (VS Code)](#option-b--rest-client-vs-code)
  - [Option C   cURL](#option-c--curl)
- [API Reference](#api-reference)
- [Log Examples](#log-examples)
- [Retry Strategy](#retry-strategy)
- [Tenant Isolation](#tenant-isolation)
- [Edge Cases](#edge-cases)

---

## Architecture

### Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        HTTP Request                          │
│         POST /api/v1/events  +  x-tenant-id header          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                  TenantMiddleware
                  (validates header, attaches req.tenantId)
                          │
                  EventsController
                  (parse + validate body via ValidationPipe)
                          │
                  EventsService
                  (orchestrate: save + enqueue)
                  ┌───────┴────────┐
           EventsRepository    QueueService
           (Prisma / PG)       (BullMQ enqueue)
                                    │
                              Redis Queue
                              "event-processing"
                                    │
                          EventProcessor (Worker)
                          (consume job, simulate logic,
                           update DB status, emit logs)
```

### Module Structure

```
prisma/
├── migrations/
├── models/
│   └── event.prisma              # Event model
├── enum.prisma                   # Enums
└── schema.prisma                 # Prisma generator and DB type

src/
├── main.ts                       # Bootstrap + global prefix + shutdown hooks
├── app.module.ts                 # Root module
│
├── common/
│   ├── logging/
│   │   └── app-logger.service.ts # Centralized structured JSON logger
│   ├── middleware/
│   │   └── tenant.middleware.ts  # x-tenant-id extraction & validation
│   └── pipes/
│       └── validation.pipe.ts    # Global ValidationPipe config
│
├── prisma/
│   ├── prisma.service.ts         # PrismaClient wrapper with lifecycle hooks
│   └── prisma.module.ts          # Global Prisma module
│
├── events/
│   ├── dto/
│   │   ├── create-event.dto.ts   # Request body DTO (class-validator)
│   │   └── event-job.payload.ts  # BullMQ job data shape
│   ├── processor/
│   │   └── events.processor.ts   # BullMQ worker
│   ├── events.controller.ts      # HTTP layer only
│   ├── events.service.ts         # Business logic / orchestration
│   ├── events.repository.ts      # All DB access (always tenant-scoped)
│   └── events.module.ts          # Feature module
│
└── queue/
    ├── config/
    │   └── queue.config.ts       # Attempts, retry and backoff config
    ├── queue.service.ts          # Enqueue helper
    └── queue.module.ts           # BullMQ queue registration
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Repository pattern | Keeps Prisma out of the service layer; makes testing trivial with a mock repo |
| `tenantId` in every DB call | Structural guarantee  cross-tenant leakage is impossible at the query level |
| 202 Accepted response | The job is async; returning 200 would imply synchronous completion |
| `status: failed` only on exhausted retries | During retries the event is still recoverable  marking it failed prematurely is misleading |
| JSON stdout logging | Zero-dependency; compatible with any log aggregator (Datadog, CloudWatch, etc.) |
| `removeOnComplete/Fail` limits | Prevents Redis memory bloat while retaining recent jobs for observability |

---

## Setup

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20+ |
| pnpm | latest |
| Docker | latest |
| PostgreSQL | 16+  |
| Redis | 7+ (or via Docker) |

---

### Installation

```bash
pnpm install
```

---

### Environment

```bash
cp .env.example .env
```

Open `.env` and verify the values match your local setup:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL="postgresql://postgres:password@localhost:5432/event_ingestion?schema=public"

REDIS_HOST=localhost
REDIS_PORT=6379

QUEUE_NAME=event-processing
```

---

### Infrastructure (Redis)


**Redis only via Docker**

If you already have PostgreSQL running locally:

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

---

### Database

Run migrations and generate the Prisma client:

```bash
# Apply migrations
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate
```

Inspect the database visually (optional):

```bash
npx prisma studio
```

---

### Running the Server

```bash
# Development — watch mode with hot reload
pnpm run start:dev

# Production
pnpm run build
pnpm run start
```

The server starts on `http://localhost:3000`. All endpoints are prefixed with `/api/v1`.

---

## Testing the Endpoints

Two ready-to-use test files are included in the repo:

| File | Tool |
|---|---|
| `endpoints.http` | VS Code REST Client extension |
| `event-ingestion.postman_collection.json` | Postman |

Both files cover the same 24 requests across 7 test groups:

| Group | What it tests |
|---|---|
| 1 — Happy Path | 202 response, eventId returned, all event types accepted |
| 2 — Tenant Isolation | Missing / empty / whitespace header → 400; tenants are isolated |
| 3 — Request Validation | Every `class-validator` rule fires correctly |
| 4 — Retry Strategy | `payload.fail=true` → 3 attempts → `status: failed` in DB |
| 5 — Structured Logging | Triggers both success and failure log chains |
| 6 — Rich Payloads | Nested objects, arrays, booleans all persist correctly |
| 7 — Edge Cases | Wrong method, wrong content-type, nonexistent route |

---

### Option A — Postman

1. Open Postman
2. Click **File → Import**
3. Select `event-ingestion.postman_collection.json`
4. The collection variables `{{baseUrl}}`, `{{validTenant}}`, and `{{anotherTenant}}` are pre-configured at collection level
5. Run individual requests or use **Run Collection** to execute all 24 at once

---

### Option B — REST Client (VS Code)

1. Install the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension
2. Open `endpoints.http`
3. Click **Send Request** above any `###` block

---

### Option C — cURL

**Success — event accepted for processing**

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-abc" \
  -d '{"type":"user_action","payload":{"action":"clicked_button"}}'
```

Expected response:

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Event accepted for processing"
}
```

**Trigger simulated failure + retry chain**

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-abc" \
  -d '{"type":"user_action","payload":{"fail":true}}'
```

Watch the server logs — you will see `retry_attempt` twice followed by `processing_failed`.

**Missing tenant header → 400**

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{"type":"user_action","payload":{}}'
```

**Invalid body type → 400**

```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-abc" \
  -d '{"type":123}'
```

---

## API Reference

### `POST /api/v1/events`

Ingests a new event for async processing.

**Headers**

| Header | Required | Description |
|---|---|---|
| `x-tenant-id` | ✅ | Tenant identifier |
| `Content-Type` | ✅ | `application/json` |

**Body**

```json
{
  "type": "user_action",
  "payload": {
    "action": "clicked_button"
  }
}
```

| Field | Type | Rules |
|---|---|---|
| `type` | `string` | Required, non-empty |
| `payload` | `object` | Required, free-form JSON |

**Response `202 Accepted`**

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Event accepted for processing"
}
```

**Error responses**

| Status | Cause |
|---|---|
| `400` | Missing/empty `x-tenant-id` header |
| `400` | Validation failure (wrong types, missing fields, unknown fields) |
| `404` | Route does not exist |
| `500` | Database or Redis unavailable |

---

## Log Examples

All logs are emitted as JSON lines to stdout. In development they are syntax-highlighted; in production they are compact single-line JSON ready for log aggregators.

**Event received**

```json
{
  "level": "info",
  "message": "job.received",
  "event": "received",
  "jobId": "N/A",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-abc",
  "attempt": 0,
  "timestamp": "2024-01-15T10:00:00.000Z"
}
```

**Processing started**

```json
{
  "level": "info",
  "message": "job.processing_started",
  "event": "processing_started",
  "jobId": "42",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-abc",
  "attempt": 1,
  "timestamp": "2024-01-15T10:00:00.120Z"
}
```

**Processing success**

```json
{
  "level": "info",
  "message": "job.processing_success",
  "event": "processing_success",
  "jobId": "42",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-abc",
  "attempt": 1,
  "timestamp": "2024-01-15T10:00:00.175Z"
}
```

**Retry attempt**

```json
{
  "level": "warn",
  "message": "job.retry_attempt",
  "event": "retry_attempt",
  "jobId": "43",
  "eventId": "661f9511-f30c-52e5-b827-557766551111",
  "tenantId": "tenant-abc",
  "attempt": 1,
  "error": "Simulated processing failure (payload.fail = true)",
  "timestamp": "2024-01-15T10:00:01.000Z"
}
```

**Permanent failure (retries exhausted)**

```json
{
  "level": "error",
  "message": "job.processing_failed",
  "event": "processing_failed",
  "jobId": "43",
  "eventId": "661f9511-f30c-52e5-b827-557766551111",
  "tenantId": "tenant-abc",
  "attempt": 3,
  "error": "Simulated processing failure (payload.fail = true)",
  "timestamp": "2024-01-15T10:00:07.000Z"
}
```

---

## Retry Strategy

Configured in `queue/config/queue.config.ts` via BullMQ `backoff: { type: 'exponential', delay: 2000 }`.

| Attempt | Delay |
|---|---|
| 1 | immediate |
| 2 | ~2 s |
| 3 | ~4 s |

After all attempts are exhausted the `onFailed` worker hook writes `status: failed` to the database and emits a `processing_failed` log entry.

---

## Tenant Isolation

Isolation is enforced at **two independent layers** so a bug in one is caught by the other:

1. **Middleware** — `TenantMiddleware` rejects any request without a valid `x-tenant-id` header before it reaches the controller. Empty strings and whitespace-only values are also rejected.

2. **Repository** — Every method in `EventsRepository` includes `tenantId` in its `WHERE` clause. Even if a caller somehow supplied the wrong `tenantId`, the query returns no rows — the database physically cannot return data belonging to another tenant.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Missing `x-tenant-id` | `TenantMiddleware` → 400 Bad Request |
| Empty or whitespace `x-tenant-id` | `TenantMiddleware` → 400 Bad Request |
| Invalid body (wrong types, extra fields) | Global `ValidationPipe` → 400 with field-level errors |
| Event not found in processor (wrong tenant) | Processor throws immediately — no retries |
| Crash between DB write and queue push | Event stays `pending`. Mitigation: cron job that re-queues stale `pending` events older than N seconds |
| All retries exhausted | `onFailed` hook writes `EventStatus.failed` to DB and emits `processing_failed` log |
| Redis unavailable | BullMQ enqueue throws → NestJS returns 500. Add a circuit-breaker or fallback queue for production |
| PostgreSQL unavailable | Prisma throws → NestJS returns 500. Use PgBouncer and DB replicas for production HA |
| Duplicate job delivery (BullMQ at-least-once) | Processor is idempotent — writing `processed` on an already-processed event is a safe no-op |
