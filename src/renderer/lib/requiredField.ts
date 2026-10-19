import { z } from '@elek-io/core';

/**
 * Puts a presence check in front of one of Core's string schemas, so an empty
 * field says what it asks for. Core's own messages win over an error map
 * passed to the resolver, and an empty name would otherwise read as breaking
 * Core's rule against `|`. Core's schema still checks everything else.
 *
 * `FormInputField` hands over an emptied input as `null`, so `null` counts as
 * missing too.
 */
export function requiredField<TOutput>(
  schema: z.ZodType<TOutput, string>,
  message: string
): z.ZodPipe<z.ZodString, z.ZodType<TOutput, string>> {
  return z.string({ error: message }).min(1, { error: message }).pipe(schema);
}
