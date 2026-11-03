import { STATUS_CODES } from 'node:http';
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiError } from '@gp/shared';
import type { Request, Response } from 'express';
import { newRequestId, routeOf } from './request-id.js';
import { requestIdOf } from './request-context.js';

type ErrorBody = ApiError & { requestId: string };

const serverErrorMessage = (requestId: string) =>
  `Something went wrong. Give support this reference: ${requestId}`;

/** Errors from body parsing and other middleware ("http-errors"): a status and a message. */
interface HttpError extends Error {
  status: number;
  expose?: boolean;
}

const isHttpError = (error: unknown): error is HttpError =>
  error instanceof Error &&
  Number.isInteger((error as HttpError).status) &&
  (error as HttpError).status >= 400 &&
  (error as HttpError).status < 600;

/**
 * The response for any error. 4xx answers keep their body (message, code, issues) and gain
 * the reference; 5xx and unknown errors say only that something went wrong, with the
 * reference, and keep a deliberate code. Nothing internal (stack, SQL, constraint names,
 * paths) reaches the caller.
 */
function errorResponse(exception: unknown, requestId: string): ErrorBody {
  if (exception instanceof Error && exception.message === 'explicit_time_zone_required')
    return {
      statusCode: 409,
      error: 'Conflict',
      message: 'Choose an explicit company or site time zone for this operation.',
      code: 'explicit_time_zone_required',
      requestId,
    };
  let status = 500;
  let code = 'internal_error';
  if (exception instanceof HttpException) {
    status = exception.getStatus();
    const response = exception.getResponse();
    if (status < 500) {
      const error = STATUS_CODES[status] ?? 'Error';
      return typeof response === 'object' && response !== null
        ? {
            statusCode: status,
            error,
            message: error,
            ...(response as Partial<ApiError>),
            requestId,
          }
        : { statusCode: status, error, message: String(response), requestId };
    }
    const own = (response as { code?: unknown } | null)?.code;
    if (typeof own === 'string') code = own;
  } else if (isHttpError(exception)) {
    status = exception.status;
    if (status < 500) {
      const error = STATUS_CODES[status] ?? 'Error';
      return {
        statusCode: status,
        error,
        message: exception.expose === false ? error : exception.message,
        requestId,
      };
    }
  }
  if (
    exception instanceof Error &&
    /^(saudi_|uae_|country_|cohort_|reviewed_hijri_|explicit_time_zone_required|ambiguous_local_time|nonexistent_local_time)/.test(
      exception.message,
    )
  )
    return {
      statusCode: 409,
      error: 'Conflict',
      message: 'Choose a supported company, date, calendar and currency context.',
      code: exception.message,
      requestId,
    };
  const cause = (exception as { cause?: { code?: string; message?: string } })?.cause;
  if (
    cause?.code === 'P0001' &&
    /saudi_|uae_|country_|currency_|statutory_|legal_profile|profile_|cross_country|cross_employer|calendar_|context_|pay_structure|run_group|employment_profile|bank_|cohort_|overlapping_|unsupported_calendar|new_jurisdiction/.test(
      cause.message ?? '',
    )
  )
    return {
      statusCode: 409,
      error: 'Conflict',
      message:
        'Explicit supported country, calendar and currency context is required; review the company profile.',
      code: 'international_context_blocked',
      requestId,
    };
  return {
    statusCode: status,
    error: STATUS_CODES[status] ?? 'Internal Server Error',
    message: serverErrorMessage(requestId),
    code,
    requestId,
  };
}

/**
 * Every error response carries the request's reference. Server errors are logged in full
 * (stack and causes, without the data they carried) under that reference, so support can
 * find them from what a person reads out.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private static readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId = requestIdOf(req) ?? newRequestId();
    const body = errorResponse(exception, requestId);
    // A body may leave out its statusCode; the exception's own status is the one to send.
    const status = exception instanceof HttpException ? exception.getStatus() : body.statusCode;
    if (status >= 500) {
      ApiExceptionFilter.logger.error({
        message: 'Request failed',
        requestId,
        method: req.method,
        route: routeOf(req),
        status,
        error: exception,
      });
    }
    if (res.headersSent) {
      res.end();
      return;
    }
    if (/^\/scim\/v2(?:\/|$)/.test(req.path)) {
      res
        .status(status)
        .type('application/scim+json')
        .json({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          status: String(status),
          detail:
            status >= 500
              ? 'Provisioning is temporarily unavailable'
              : 'Invalid provisioning request',
        });
    } else if (/^\/public\/v1(?:\/|$)/.test(req.path) || req.path === '/oauth/token') {
      const code =
        status === 404
          ? 'not_found'
          : status >= 500
            ? 'temporarily_unavailable'
            : 'invalid_request';
      const message =
        status >= 500 ? 'Temporarily unavailable' : (STATUS_CODES[status] ?? 'Request refused');
      res
        .status(status)
        .type('application/json')
        .json(
          req.path === '/oauth/token'
            ? { error: code, error_description: message, request_id: requestId }
            : { error: { code, message, request_id: requestId } },
        );
    } else res.status(status).type('application/json').json(body);
  }
}
