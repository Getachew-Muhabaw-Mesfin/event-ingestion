import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';

export interface CreateEventInput {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * EventsRepository
 *
 * All Prisma calls live here — services never touch PrismaClient directly.
 * Every method accepts tenantId and always adds it to the WHERE clause,
 * making cross-tenant data leakage structurally impossible at the DB layer.
 */
@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEventInput) {
    return this.prisma.event.create({
      data: {
        id: input.id,
        tenantId: input.tenantId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        status: EventStatus.pending,
      },
    });
  }

  /**
   * Finds an event only if it belongs to the given tenant.
   * Returns null for both "not found" and "wrong tenant" — callers cannot
   * distinguish between the two, which prevents tenant enumeration.
   */
  async findByIdAndTenant(eventId: string, tenantId: string) {
    return this.prisma.event.findFirst({
      where: { id: eventId, tenantId },
    });
  }

  async updateStatus(eventId: string, tenantId: string, status: EventStatus) {
    return this.prisma.event.updateMany({
      where: { id: eventId, tenantId },
      data: { status },
    });
  }
}
