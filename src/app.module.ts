import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EventsModule } from './events/events.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

/**
 * AppModule
 *
 * - ConfigModule is global so env vars are available everywhere via ConfigService.
 * - BullModule.forRootAsync sets the shared Redis connection for all queues.
 * - TenantMiddleware is applied to all routes; add exclusions here if needed
 *   (e.g. health-check endpoints).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Shared Redis connection — all BullModule.registerQueueAsync calls
    // inherit this unless they provide their own `connection` override.
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),

    PrismaModule,
    EventsModule,
  ],
  providers: [PrismaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
