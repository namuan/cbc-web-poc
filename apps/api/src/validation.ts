import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parseBody<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Request validation failed',
      issues: result.error.issues.map(({ path, message }) => ({ path, message }))
    });
  }
  return result.data;
}
