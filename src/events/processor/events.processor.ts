import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EVENT_QUEUE_NAME } from '../../queue/queue.service';
import { EventsRepository } from '../events.repository';
import { AppLogger } from '../../common/logging/app-logger.service';
import { EventJobPayload } from '../dto/event-job.payload';
import { EventStatus } from '../../generated/prisma/enums';

/**
 * EventProcessor
 *
 * The worker that consumes jobs from the event-processing queue.
 * Runs in the same process as the API server for simplicity; in
 * production this can be split into a dedicated worker process by
 * pointing the same BullMQ configuration at the same Redis instance.
 *
 * Job lifecycle:
 *   received → processing_started → processing_success
 *                                 → retry_attempt (on transient error)
 *                                 → processing_failed (retries exhausted)
 */
@Processor(EVENT_QUEUE_NAME)
export class EventProcessor extends WorkerHost {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(job: Job<EventJobPayload>): Promise<void> {
    const { eventId, tenantId, type } = job.data;
    const attempt = job.attemptsMade + 1;

    this.logger.logJobEvent({
      event: 'processing_started',
      jobId: String(job.id),
      eventId,
      tenantId,
      attempt,
    });

    // ── Tenant isolation ──────────────────────────────────────────────────
    // Fetch the event scoped to tenantId; null means the event either does
    // not exist or belongs to a different tenant (we treat both the same).
    const event = await this.eventsRepository.findByIdAndTenant(
      eventId,
      tenantId,
    );

    if (!event) {
      // Permanent failure — no retry makes sense for missing/mismatched tenant
      this.logger.logJobEvent({
        event: 'processing_failed',
        jobId: String(job.id),
        eventId,
        tenantId,
        attempt,
        error: 'Event not found or tenant mismatch',
      });
      // Throwing here triggers BullMQ retry logic; returning silently would
      // mark the job as completed which would hide the problem.
      throw new Error(
        'Event not found or tenant mismatch — aborting without retry',
      );
    }

    // ── Simulated failure path ────────────────────────────────────────────
    if (
      event.payload &&
      typeof event.payload === 'object' &&
      (event.payload as Record<string, unknown>).fail === true
    ) {
      throw new Error('Simulated processing failure (payload.fail = true)');
    }

    // ── Business logic dispatch ───────────────────────────────────────────
    // Real systems would dispatch to a handler registry keyed by `type`.
    // Here we simulate per-type work.
    await this.handleByType(type, event.payload as Record<string, unknown>);

    // ── Mark success ──────────────────────────────────────────────────────
    await this.eventsRepository.updateStatus(
      eventId,
      tenantId,
      EventStatus.processed,
    );

    this.logger.logJobEvent({
      event: 'processing_success',
      jobId: String(job.id),
      eventId,
      tenantId,
      attempt,
    });
  }

  /**
   * Called by BullMQ when all retry attempts are exhausted.
   * This is the ONLY place we write EventStatus.failed — we never
   * write it during a transient error because the job might still succeed
   * on the next attempt.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<EventJobPayload>, error: Error): Promise<void> {
    const { eventId, tenantId } = job.data;
    const isRetryExhausted = job.attemptsMade >= (job.opts.attempts ?? 1);

    if (isRetryExhausted) {
      await this.eventsRepository.updateStatus(
        eventId,
        tenantId,
        EventStatus.failed,
      );

      this.logger.logJobEvent({
        event: 'processing_failed',
        jobId: String(job.id),
        eventId,
        tenantId,
        attempt: job.attemptsMade,
        error: error.message,
      });
    } else {
      this.logger.logJobEvent({
        event: 'retry_attempt',
        jobId: String(job.id),
        eventId,
        tenantId,
        attempt: job.attemptsMade,
        error: error.message,
      });
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async handleByType(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // Simulate async I/O (e.g. calling a downstream service)
    await new Promise((r) => setTimeout(r, 50));

    switch (type) {
      case 'user_action':
        this.logger.debug('Handling user_action event', { payload });
        break;
      case 'system_event':
        this.logger.debug('Handling system_event', { payload });
        break;
      default:
        this.logger.warn(`Unknown event type: ${type} — processed as no-op`);
    }
  }
}
