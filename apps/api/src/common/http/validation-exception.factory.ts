import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

import type { ApiErrorBody } from './api-error';

/**
 * Turns class-validator output into the same `{ code, message, field }` shape
 * the calculation module produces.
 *
 * Nest's default emits `{ message: string[] }`, which forces the client to
 * parse prose to find out which input was wrong. Reporting the first failure
 * with a dotted field path lets the UI highlight the exact control instead.
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const first = flatten(errors)[0];

  const body: ApiErrorBody = {
    code: 'VALIDATION_ERROR',
    message: first?.message ?? 'The submitted data is invalid.',
    ...(first?.field ? { field: first.field } : {}),
  };

  return new BadRequestException(body);
}

interface FlatError {
  field: string;
  message: string;
}

/** Walks nested errors into dotted paths, e.g. `lineItems.0.discount.value`. */
function flatten(errors: ValidationError[], prefix = ''): FlatError[] {
  return errors.flatMap((error) => {
    const field = prefix ? `${prefix}.${error.property}` : error.property;

    const own = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    const nested = error.children?.length ? flatten(error.children, field) : [];

    return [...own, ...nested];
  });
}
