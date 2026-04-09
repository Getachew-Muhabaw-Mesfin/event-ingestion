import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsRepository } from './events.repository';
import { QueueModule } from '../queue/queue.module';
import { AppLogger } from '../common/logging/app-logger.service';
import { EventProcessor } from './processor/events.processor';

@Module({
  imports: [QueueModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository, EventProcessor, AppLogger],
})
export class EventsModule {}
