// Helpers for reading react-hook-form's error tree by path. Used by AppForm to
// find a validation error that no mounted message covers, and by the primitives
// that render such an error. See contributing/renderer/forms.md.

/** One validation message together with the dot path it sits at. */
export interface FieldErrorMessage {
  path: string;
  message: string;
  /**
   * react-hook-form's error type, which is the zod issue code the resolver
   * reported. `undefined` for a node that carries none, which nothing the
   * resolver writes does.
   */
  type?: string;
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

  const { message, type } = node;
  if (typeof message === 'string' && message !== '') {
    found.push({
      path: path.join('.'),
      message,
      ...(typeof type === 'string' ? { type } : {}),
    });
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

/**
 * Which of the Project's languages hold an error somewhere in the form.
 *
 * A translatable Value is bound at `<path>.<language>`, so the language of a
 * refused Value is a segment of its path, whichever field and whichever
 * section it sits in. It is what marks a language in the switch above the
 * fields, so an error in a language nobody is looking at is still visible.
 */
export function languagesWithErrors<TLanguage extends string>(
  errors: unknown,
  languages: readonly TLanguage[]
): Set<TLanguage> {
  const found = new Set<TLanguage>();

  for (const message of collectFieldErrorMessages(errors)) {
    const segments = new Set(message.path.split('.'));
    for (const language of languages) {
      if (segments.has(language)) {
        found.add(language);
      }
    }
  }

  return found;
}

/** Whether `path` is `prefix` itself or sits below it. */
export function isAtOrBelow(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`);
}

/**
 * The one message a field renders, out of the errors at or below its own path.
 *
 * A field renders what sits at its path and what sits below it, because a
 * refusal of one part of a Value (a block of a markdown tree, one reference of
 * a list) is about that field and has no surface of its own. Without this a
 * refusal below the path a field binds would sit where nothing reads it, so the
 * submit would say nothing at all.
 *
 * What it leaves alone is a message something mounted deeper renders, which is
 * how a field holding sections stays silent while the field inside a section
 * says what is wrong. react-hook-form's `root` needs no case of its own: an
 * error reported on an array itself is nested under `root` as soon as any path
 * inside that array is a registered field name, and `root` is then a key below
 * the field like any other.
 *
 * @param error The error subtree at `name`, as `Controller` hands it over.
 * @param name The path the field binds, which the returned path is relative to.
 * @param isRenderedDeeper Whether a path is claimed by an error target below
 * `name`, see `useDeeperErrorTarget`.
 */
export function fieldErrorMessage(
  error: unknown,
  name: string,
  isRenderedDeeper: (path: string) => boolean
): FieldErrorMessage | undefined {
  for (const found of collectFieldErrorMessages(error)) {
    const path = found.path === '' ? name : `${name}.${found.path}`;

    if (isRenderedDeeper(path) === false) {
      return { ...found, path };
    }
  }

  return undefined;
}
