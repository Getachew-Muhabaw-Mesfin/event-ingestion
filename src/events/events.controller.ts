import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

/**
 * EventsController
 *
 * Responsibilities (and only these):
 * - Parse / validate the request body via the global ValidationPipe
 * - Read tenantId from the request object (already set by TenantMiddleware)
 * - Delegate to EventsService
 * - Return a consistent HTTP response shape
 *
 * No business logic belongs here.
 */
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED) // 202: accepted for async processing
  async create(@Req() req: Request, @Body() dto: CreateEventDto) {
    const event = await this.eventsService.ingest(req.tenantId, dto);
    return {
      eventId: event.id,
      status: event.status,
      message: 'Event accepted for processing',
    };
  }
}
