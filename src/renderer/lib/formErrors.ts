// Helpers for reading react-hook-form's error tree by path. Used by AppForm to
// find a validation error that no mounted message covers, and by the primitives
// that render such an error. See contributing/renderer/forms.md.

/** One validation message together with the dot path it sits at. */
export interface FieldErrorMessage {
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function collect(
  node: unknown,
  path: string[],
  found: FieldErrorMessage[]
): void {
  if (isRecord(node) === false) {
    return;
  }

  const { message } = node;
  if (typeof message === 'string' && message !== '') {
    found.push({ path: path.join('.'), message });
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    // `ref` points back at the input and `types` repeats the same messages under
    // criteriaMode 'all', so neither is a nested field.
    if (key === 'ref' || key === 'types') {
      continue;
    }
    collect(value, [...path, key], found);
  }
}

/**
 * Flattens react-hook-form's nested error object into one entry per message,
 * keyed by its dot path (`fieldDefinitions.0.label.de`). Array indices become
 * numeric segments, matching the path zod reports.
 */
export function collectFieldErrorMessages(
  errors: unknown
): FieldErrorMessage[] {
  const found: FieldErrorMessage[] = [];
  collect(errors, [], found);
  return found;
}

/** Whether `path` is `prefix` itself or sits below it. */
export function isAtOrBelow(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}
