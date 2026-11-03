import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
@Catch()
export class ScimErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const db =
      (error as { cause?: { code?: string }; code?: string })?.cause ??
      (error as { code?: string });
    const status =
      error instanceof HttpException ? error.getStatus() : db?.code === '23505' ? 409 : 500;
    const body = error instanceof HttpException ? error.getResponse() : undefined;
    const scim =
      body && typeof body === 'object' && 'schemas' in body
        ? body
        : {
            schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
            status: String(status),
            detail:
              status === 409
                ? 'Resource already exists'
                : status === 500
                  ? 'Provisioning could not be completed'
                  : status === 429
                    ? 'Too many provisioning requests'
                    : 'Invalid provisioning request',
            ...(status === 409 ? { scimType: 'uniqueness' } : {}),
          };
    response.status(status).type('application/scim+json').json(scim);
  }
}
