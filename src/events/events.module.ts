import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsRepository } from './events.repository';
import { QueueModule } from '../queue/queue.module';
import { AppLogger } from '../common/logging/app-logger.service';
import { EVENT_QUEUE_NAME } from '../queue/queue.service';
import { EventProcessor } from './processor/events.processor';

/**
 * EventsModule
 *
 * Owns everything related to the events domain:
 * - HTTP surface (controller)
 * - Business logic (service)
 * - Data access (repository)
 * - Job processing (processor / worker)
 *
 * The processor needs a direct reference to the BullMQ queue (via
 * BullModule.registerQueueAsync) so it can be decorated with @Processor.
 * QueueModule is imported for the QueueService producer.
 */
@Module({
  imports: [
    QueueModule,
    // Processor also needs the queue registered in its own module context
    BullModule.registerQueueAsync({
      name: EVENT_QUEUE_NAME,
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository, EventProcessor, AppLogger],
})
export class EventsModule {}
