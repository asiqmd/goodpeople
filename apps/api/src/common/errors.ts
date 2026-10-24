import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { ApiError } from '@gp/shared';

/** A 403 whose body carries a machine-readable code the web and mobile apps can branch on. */
export function forbidden(code: string, message: string): ForbiddenException {
  const body: ApiError = { statusCode: 403, error: 'Forbidden', message, code };
  return new ForbiddenException(body);
}

export function badRequest(code: string, message: string): BadRequestException {
  const body: ApiError = { statusCode: 400, error: 'Bad Request', message, code };
  return new BadRequestException(body);
}

export function conflict(code: string, message: string): ConflictException {
  const body: ApiError = { statusCode: 409, error: 'Conflict', message, code };
  return new ConflictException(body);
}
