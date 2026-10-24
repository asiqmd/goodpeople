import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ApiBodyOptions } from '@nestjs/swagger';
import type { ApiError } from '@gp/shared';
import { z } from 'zod';

/** Validates a request body against a shared zod schema; use as `@Body(zod(schema))`. */
export function zod<T extends z.ZodType>(schema: T): PipeTransform<unknown, z.infer<T>> {
  return {
    transform(value: unknown) {
      const result = schema.safeParse(value);
      if (result.success) return result.data;
      const body: ApiError = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        code: 'validation_failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
      throw new BadRequestException(body);
    },
  };
}

/** The same zod schema, as an OpenAPI request body: `@ApiBody(openApiBody(schema))`. */
export function openApiBody(schema: z.ZodType): ApiBodyOptions {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, { io: 'input' });
  // JSON Schema 2020-12 and OpenAPI 3 schema objects differ only in details Swagger UI tolerates.
  return { schema: json } as unknown as ApiBodyOptions;
}
