import { Injectable, LoggerService } from '@nestjs/common';

export type LogEvent =
  | 'received'
  | 'processing_started'
  | 'processing_success'
  | 'processing_failed'
  | 'retry_attempt';

export interface JobLogContext {
  event: LogEvent;
  jobId: string;
  eventId: string;
  tenantId: string;
  attempt: number;
  error?: string;
  [key: string]: unknown;
}

/**
 * Centralized structured logger.
 * All job lifecycle events are emitted as JSON lines — easy to ship to
 * Datadog, CloudWatch, or any log aggregator without changes.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private output(
    level: string,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    // In production replace with pino / winston transport
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  log(message: string, meta?: Record<string, unknown>): void {
    this.output('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.output('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.output('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      this.output('debug', message, meta);
    }
  }

  /**
   * Emit a structured job-lifecycle log entry.
   * This is the canonical shape consumed by log dashboards / alerts.
   */
  logJobEvent(ctx: JobLogContext): void {
    const { event, ...rest } = ctx;
    const level =
      event === 'processing_failed'
        ? 'error'
        : event === 'retry_attempt'
          ? 'warn'
          : 'info';

    this.output(level, `job.${event}`, { event, ...rest });
  }
}
