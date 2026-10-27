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
    res.status(status).type('application/json').json(body);
  }
}
