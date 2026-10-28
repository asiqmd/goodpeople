import {
  HttpException,
  HttpStatus,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  type CallHandler,
  type NestInterceptor,
} from '@nestjs/common';
import { CV_MAX_BYTES, type ApiError } from '@gp/shared';
import { catchError, throwError, type Observable } from 'rxjs';
import { cvFileType, type CvType } from '../recruitment/intake.js';

/** Multipart limits for a CV; one file of up to 5 MB. */
export const CV_UPLOAD = { limits: { fileSize: CV_MAX_BYTES, files: 1 } };

export function cvTooLarge(): HttpException {
  const body: ApiError = {
    statusCode: 413,
    error: 'Payload Too Large',
    message: `A CV can be up to ${CV_MAX_BYTES / (1024 * 1024)} MB`,
    code: 'cv_too_large',
  };
  return new HttpException(body, HttpStatus.PAYLOAD_TOO_LARGE);
}

/** The file's type from its bytes, or a refusal: CVs are PDF or Word documents. */
export function checkedCvType(bytes: Buffer): CvType {
  const type = cvFileType(bytes);
  if (!type) {
    const body: ApiError = {
      statusCode: 415,
      error: 'Unsupported Media Type',
      message: 'Upload the CV as a PDF or a Word document (.docx)',
      code: 'cv_type',
    };
    throw new UnsupportedMediaTypeException(body);
  }
  return type;
}

/** Gives multer's size limit the code the web translates. */
@Injectable()
export class CvLimits implements NestInterceptor {
  intercept(_: unknown, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof PayloadTooLargeException ? cvTooLarge() : error)),
        ),
      );
  }
}
