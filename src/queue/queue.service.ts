import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventJobPayload } from '../events/dto/event-job.payload';
import { AppLogger } from '../common/logging/app-logger.service';

export const EVENT_QUEUE_NAME = 'event-processing';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(EVENT_QUEUE_NAME) private readonly queue: Queue,
    private readonly logger: AppLogger,
  ) {}

  async enqueueEventJob(payload: EventJobPayload): Promise<void> {
    await this.queue.add('process-event', payload);
    this.logger.log('Job enqueued', {
      queue: EVENT_QUEUE_NAME,
      eventId: payload.eventId,
      tenantId: payload.tenantId,
      type: payload.type,
    });
  }
}
