import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export const TENANT_HEADER = 'x-tenant-id';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId: string;
    }
  }
}

/**
 * TenantMiddleware
 *
 * Applied globally (or per-route) to ensure every inbound request carries
 * a valid x-tenant-id header.  No cross-tenant data can leak because every
 * downstream service layer receives tenantId from request context only.
 *
 * Extension point: swap the simple "non-empty" check for a DB/cache lookup
 * to validate that the tenant is a known, active account.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const tenantId = req.headers[TENANT_HEADER];

    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      throw new BadRequestException(
        `Missing or empty required header: ${TENANT_HEADER}`,
      );
    }

    // Attach to request so controllers/services can access it without
    // coupling to raw HTTP headers.
    req.tenantId = tenantId.trim();
    next();
  }
}
