# Event Ingestion Service

Tenant-aware event ingestion and async processing system built with NestJS, PostgreSQL (Prisma), and Redis (BullMQ).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        HTTP Request                          │
│              POST /events  +  x-tenant-id header            │
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

### Module structure

```
prisma/
|   migrations/
|   models/
|      event.prisma                  #Event model
|   enum.prisma                     #Enums
|   schema.prisma                   # Prisma generator and  db type
|
src/
├── main.ts                          # Bootstrap + global middleware
├── app.module.ts                    # Root module
│
├── common/
│   ├── logging/
│   │   └── app-logger.service.ts   # Centralized structured JSON logger
│   ├── middleware/
│   │   └── tenant.middleware.ts    # x-tenant-id extraction & validation
│   └── pipes/
│       └── validation.pipe.ts      # Global ValidationPipe config
│
├── prisma/
│   ├── prisma.service.ts           # PrismaClient wrapper
│   └── prisma.module.ts            # Global Prisma module
│
├── events/
│   ├── dto/
│   │   ├── create-event.dto.ts     # Request body DTO (class-validator)
│   │   └── event-job.payload.ts    # BullMQ job data shape
|   |   ├── processor/
|   |       ├── events.processor.ts # BullMQ worker
│   ├── events.controller.ts        # HTTP layer only
│   ├── events.service.ts           # Business logic / orchestration
│   ├── events.repository.ts        # All DB access (always tenant-scoped)
│   └── events.module.ts            # Feature module
│
└── queue/
    |──config/
       |──queue.config.ts            # Queue config Atempts, retry and backoff
    ├── queue.service.ts             # Enqueue helper + retry config
    └── queue.module.ts              # BullMQ queue registration
```

---

## Key Design Decisions

| Decision                                   | Rationale                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Repository pattern                         | Keeps Prisma out of the service layer; makes testing trivial with a mock repo               |
| `tenantId` in every DB call                | Structural guarantee — cross-tenant leakage is impossible at the query level                |
| 202 Accepted response                      | The job is async; returning 200 would imply synchronous completion                          |
| `status: failed` only on exhausted retries | During retries the event is still recoverable — marking it failed prematurely is misleading |
| JSON stdout logging                        | Zero-dependency; compatible with any log aggregator (Datadog, CloudWatch, etc.)             |
| `removeOnComplete/Fail` limits             | Prevents Redis memory bloat while retaining recent jobs for observability                   |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Redis
- pnpm
- Docker

## Project setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run Redis using docker, or manually

```bash
docker run -d --name redis -p 6379:6379 redis:8.2.5-bookworm
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env if your ports differ
```

### 4. Run database migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. Start the server

```bash
# Development (watch mode)
pnpm run start:dev

# Production
pnpm run build && npm start
```

---

## API Reference

### POST /events

Ingest a new event for async processing.

**Headers**

| Header         | Required | Description        |
| -------------- | -------- | ------------------ |
| `x-tenant-id`  | ✅       | Tenant identifier  |
| `Content-Type` | ✅       | `application/json` |

**Body**

```json
{
  "type": "user_action",
  "payload": { "action": "clicked_button" }
}
```

**Response — 202 Accepted**

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Event accepted for processing"
}
```

---

## Example Requests

### Success flow

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-abc" \
  -d '{"type":"user_action","payload":{"action":"clicked_button"}}'
```

### Trigger simulated failure + retries

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "x-tenant-id: tenant-abc" \
  -d '{"type":"user_action","payload":{"fail":true}}'
```

### Missing tenant header → 400

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{"type":"user_action","payload":{}}'
```

### Invalid body → 400

```bash
curl -X POST http://localhost:3000/events \
  -H "x-tenant-id: tenant-abc" \
  -H "Content-Type: application/json" \
  -d '{"type":123}'
```

---

## Log Examples

All logs are JSON lines written to stdout.

### Event received

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

### Processing started

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

### Processing success

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

### Retry attempt (transient failure)

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

### Permanent failure (all retries exhausted)

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

| Attempt | Delay     |
| ------- | --------- |
| 1       | immediate |
| 2       | ~2 s      |
| 3       | ~4 s      |

Configured via BullMQ `backoff: { type: 'exponential', delay: 2000 }` in `queue.config.ts`.

---

## Tenant Isolation

Isolation is enforced at **two layers**:

1. **Middleware** — `TenantMiddleware` rejects any request without a valid `x-tenant-id` header before it reaches the controller.
2. **Repository** — Every `EventsRepository` method includes `tenantId` in the `WHERE` clause. Even if a caller somehow passed the wrong `tenantId`, the query returns no rows.

The two-layer approach means a bug in one layer is caught by the other.

---

## Edge Cases & How They Are Handled

| Scenario                                      | Handling                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Missing `x-tenant-id`                         | `TenantMiddleware` → 400 Bad Request                                                                       |
| Invalid body (wrong types, extra fields)      | Global `ValidationPipe` → 400 with field-level errors                                                      |
| Event not found in processor (wrong tenant)   | Processor throws → job fails immediately (no retries)                                                      |
| Crash between DB write and queue push         | Event stays `pending`. **Mitigation**: add a cron job that re-queues `pending` events older than N seconds |
| All retries exhausted                         | `onFailed` hook writes `EventStatus.failed` to DB and logs `processing_failed`                             |
| Redis unavailable                             | BullMQ `enqueue` throws; NestJS returns 500. Consider a circuit-breaker or fallback queue for production   |
| PostgreSQL unavailable                        | Prisma throws; NestJS returns 500. Standard DB HA / connection pooling (PgBouncer) applies                 |
| Duplicate job delivery (BullMQ at-least-once) | Processor is idempotent — updating a `processed` event to `processed` again is a no-op                     |

---
