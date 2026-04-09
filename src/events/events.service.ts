import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsRepository } from './events.repository';
import { QueueService } from '../queue/queue.service';
import { AppLogger } from '../common/logging/app-logger.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly queueService: QueueService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Ingests an event:
   * 1. Persists it to PostgreSQL (status = pending)
   * 2. Pushes an async processing job to BullMQ
   *
   * The two steps are intentionally NOT wrapped in a DB transaction with
   * the queue push — BullMQ is external infrastructure and does not
   * participate in Postgres transactions.
   *
   * Reliability note: if the process crashes between step 1 and step 2 the
   * event will remain "pending" forever. A simple recovery job (cron that
   * re-queues stale pending events) is the recommended mitigation for
   * production and is noted in the README.
   */
  async ingest(tenantId: string, dto: CreateEventDto) {
    const eventId = randomUUID();

    const event = await this.eventsRepository.create({
      id: eventId,
      tenantId,
      type: dto.type,
      payload: dto.payload,
    });

    this.logger.logJobEvent({
      event: 'received',
      jobId: 'N/A', // jobId is assigned by BullMQ after enqueue
      eventId,
      tenantId,
      attempt: 0,
    });

    await this.queueService.enqueueEventJob({
      eventId,
      tenantId,
      type: dto.type,
    });

    return event;
  }
}
