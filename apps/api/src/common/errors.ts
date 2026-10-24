import { ForbiddenException } from '@nestjs/common';
import type { ApiError } from '@gp/shared';

/** A 403 whose body carries a machine-readable code the web and mobile apps can branch on. */
export function forbidden(code: string, message: string): ForbiddenException {
  const body: ApiError = { statusCode: 403, error: 'Forbidden', message, code };
  return new ForbiddenException(body);
}
