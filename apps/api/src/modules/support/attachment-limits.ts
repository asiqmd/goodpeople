import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type CallHandler,
  type NestInterceptor,
} from '@nestjs/common';
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENTS_PER_MESSAGE,
  type ApiError,
} from '@gp/shared';
import { catchError, throwError, type Observable } from 'rxjs';

const MB = SUPPORT_ATTACHMENT_MAX_BYTES / (1024 * 1024);

export function attachmentTooLarge(): HttpException {
  const body: ApiError = {
    statusCode: 413,
    error: 'Payload Too Large',
    message: `Each file can be up to ${MB} MB`,
    code: 'attachment_too_large',
  };
  return new HttpException(body, HttpStatus.PAYLOAD_TOO_LARGE);
}

export function tooManyAttachments(): BadRequestException {
  const body: ApiError = {
    statusCode: 400,
    error: 'Bad Request',
    message: `Attach up to ${SUPPORT_ATTACHMENTS_PER_MESSAGE} files`,
    code: 'too_many_attachments',
  };
  return new BadRequestException(body);
}

export function attachmentType(): UnsupportedMediaTypeException {
  const body: ApiError = {
    statusCode: 415,
    error: 'Unsupported Media Type',
    message:
      'Attach a PNG, JPEG or WebP picture, a PDF, an Excel workbook (.xlsx), or a CSV or text file',
    code: 'attachment_type',
  };
  return new UnsupportedMediaTypeException(body);
}

/** Gives the upload's own limits (from multer) the codes the web translates. */
@Injectable()
export class AttachmentLimits implements NestInterceptor {
  intercept(_: unknown, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() => {
          if (error instanceof PayloadTooLargeException) return attachmentTooLarge();
          if (error instanceof BadRequestException && error.message === 'Too many files') {
            return tooManyAttachments();
          }
          return error;
        }),
      ),
    );
  }
}

/** Multipart limits for a message's files; the service checks the same limits again. */
export const ATTACHMENT_UPLOAD = {
  limits: { fileSize: SUPPORT_ATTACHMENT_MAX_BYTES, files: SUPPORT_ATTACHMENTS_PER_MESSAGE },
};
