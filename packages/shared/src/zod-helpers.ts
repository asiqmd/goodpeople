import { z } from 'zod';

type Undefaulted<T extends z.ZodRawShape> = {
  [K in keyof T]: T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K];
};

/**
 * The fields without their defaults, for PATCH schemas: zod's partial() keeps defaults, so a
 * field left out of an update would be reset instead of left alone.
 */
export function withoutDefaults<T extends z.ZodRawShape>(shape: T): Undefaulted<T> {
  return Object.fromEntries(
    Object.entries(shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault ? field.unwrap() : field,
    ]),
  ) as Undefaulted<T>;
}
