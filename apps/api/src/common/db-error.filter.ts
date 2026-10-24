import { BadRequestException, Catch, ConflictException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { ApiError } from '@gp/shared';

interface PgError {
  code?: string;
  constraint?: string;
}

/** Friendly messages for the unique constraints people actually run into. */
const UNIQUE_MESSAGES: Record<string, string> = {
  employees_tenant_code_uq: 'Another employee already has this employee code',
  employees_tenant_nid_uq: 'Another employee already has this NID',
  employees_user_uq: 'This login is already linked to an employee',
  tenant_users_tenant_email_uq: 'A workspace login with this email already exists',
  employees_tenant_pin_uq: 'Another employee already uses this attendance PIN',
  regularization_requests_pending_uq: 'A correction for this day is already waiting for approval',
  attendance_devices_tenant_serial_uq: 'A device with this serial number is already registered',
};

/**
 * Turns database constraint violations into 4xx responses instead of 500s. A foreign-key
 * violation here usually means an id from another workspace: the composite (tenant_id, id)
 * keys reject it.
 */
@Catch()
export class DbErrorFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    const pg = pgErrorOf(exception);
    if (pg?.code === '23505') {
      const message =
        UNIQUE_MESSAGES[pg.constraint ?? ''] ??
        (pg.constraint?.endsWith('_code_uq')
          ? 'This code is already in use'
          : 'This already exists');
      const body: ApiError = { statusCode: 409, error: 'Conflict', message, code: 'duplicate' };
      return super.catch(new ConflictException(body), host);
    }
    if (pg?.code === '23503') {
      const body: ApiError = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'A referenced record does not exist in this workspace',
        code: 'invalid_reference',
      };
      return super.catch(new BadRequestException(body), host);
    }
    return super.catch(exception, host);
  }
}

function pgErrorOf(exception: unknown): PgError | undefined {
  // Drizzle wraps driver errors; the pg error is the cause.
  for (
    let e = exception as { code?: unknown; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  ) {
    if (typeof e.code === 'string' && /^\d{5}$/.test(e.code)) return e as PgError;
  }
  return undefined;
}
