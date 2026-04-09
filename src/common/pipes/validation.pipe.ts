import { ValidationPipe } from '@nestjs/common';

/**
 * Shared ValidationPipe configuration.
 * - whitelist: strips unknown properties (prevents payload pollution)
 * - forbidNonWhitelisted: returns 400 for unknown fields rather than silently ignoring them
 * - transform: coerces primitives to their DTO types automatically
 */
export const globalValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
