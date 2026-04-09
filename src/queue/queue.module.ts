import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { EVENT_QUEUE_NAME, QueueService } from './queue.service';
import { AppLogger } from '../common/logging/app-logger.service';
import { DEFAULT_JOB_OPTIONS } from './config/queue.config';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: EVENT_QUEUE_NAME,
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [QueueService, AppLogger],
  exports: [QueueService, BullModule],
})
export class QueueModule {}
