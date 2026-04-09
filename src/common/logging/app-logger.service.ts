import { Injectable, LoggerService } from '@nestjs/common';
import chalk from 'chalk';

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

@Injectable()
export class AppLogger implements LoggerService {
  private readonly ignoredContexts = new Set([
    'NestFactory',
    'InstanceLoader',
    'RoutesResolver',
    'RouterExplorer',
    'NestApplication',
    'BullModule',
  ]);

  private readonly isProduction = process.env.NODE_ENV === 'production';

  private writeJson(entry: Record<string, unknown>): void {
    const json = JSON.stringify(entry, null, this.isProduction ? 0 : 2);

    if (this.isProduction) {
      process.stdout.write(json + '\n');
      return;
    }

    const colored = this.colorizeJson(json, entry.level as string);
    process.stdout.write(colored + '\n');
  }

  private colorizeJson(json: string, level: string): string {
    let colorFn: (s: string) => string;
    switch (level) {
      case 'error':
        colorFn = chalk.red;
        break;
      case 'warn':
        colorFn = chalk.yellow;
        break;
      case 'debug':
        colorFn = chalk.gray;
        break;
      default:
        colorFn = chalk.white;
    }

    return json
      .replace(/"([^"]+)":/g, (_, key: string) => chalk.cyan(`"${key}"`) + ':')
      .replace(
        /: "([^"]*)"/g,
        (_, val: string) => ': ' + chalk.green(`"${val}"`),
      )
      .replace(/: (\d+)/g, (_, num: string) => ': ' + chalk.yellow(num))
      .replace(
        /: (true|false)/g,
        (_, bool: string) => ': ' + chalk.magenta(bool),
      )
      .split('\n')
      .map((line) => colorFn(line))
      .join('\n');
  }

  private shouldIgnore(context?: string): boolean {
    return !!context && this.ignoredContexts.has(context);
  }

  private logInternal(
    level: string,
    message: string,
    secondArg?: string | Record<string, unknown>,
  ): void {
    if (typeof secondArg === 'string') {
      if (this.shouldIgnore(secondArg)) return;
      this.writeJson({
        level,
        message,
        context: secondArg,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    this.writeJson({
      level,
      message,
      timestamp: new Date().toISOString(),
      ...secondArg,
    });
  }

  private extractContext(
    optionalParams: unknown[],
  ): string | Record<string, unknown> | undefined {
    const first = optionalParams[0];
    if (typeof first === 'string') return first;
    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      return first as Record<string, unknown>;
    }
    return undefined;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logInternal(
      'info',
      String(message),
      this.extractContext(optionalParams),
    );
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logInternal(
      'warn',
      String(message),
      this.extractContext(optionalParams),
    );
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logInternal(
      'error',
      String(message),
      this.extractContext(optionalParams),
    );
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    if (!this.isProduction) {
      this.logInternal(
        'debug',
        String(message),
        this.extractContext(optionalParams),
      );
    }
  }

  logJobEvent(ctx: JobLogContext): void {
    const { event, ...rest } = ctx;
    const level =
      event === 'processing_failed'
        ? 'error'
        : event === 'retry_attempt'
          ? 'warn'
          : 'info';

    this.writeJson({
      level,
      message: `job.${event}`,
      event,
      timestamp: new Date().toISOString(),
      ...rest,
    });
  }
}
