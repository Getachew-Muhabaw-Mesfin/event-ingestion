/**
 * Canonical shape of the BullMQ job data for the event-processing queue.
 * Kept in a shared DTO so the producer and consumer always agree on the schema.
 */
export interface EventJobPayload {
  eventId: string;
  tenantId: string;
  type: string;
}
