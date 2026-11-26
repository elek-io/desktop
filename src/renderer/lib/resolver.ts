import type { FieldValues, Resolver } from 'react-hook-form';

/**
 * Wraps a resolver so an all-blank `description` reaches Core as `null`, its
 * canonical "no description" value.
 *
 * Core makes a field definition's and a Component's `description` optional
 * (nullable) but rejects a present-but-empty language, so an empty UI state has
 * to be coerced to `null` rather than kept as `{ en: '' }`. A form seeds every
 * language, which makes Core's member schema force each to be filled once any
 * is (matching Core's all-or-nothing rule), while a wholly blank description
 * means the user wants none.
 *
 * This only normalizes input to Core's own canonical value, it adds no rule of
 * its own, so validation stays entirely Core's.
 */
export function withEmptyDescriptionAsNull<
  TFieldValues extends FieldValues,
  TContext,
  TTransformedValues extends FieldValues,
>(
  resolver: Resolver<TFieldValues, TContext, TTransformedValues>
): Resolver<TFieldValues, TContext, TTransformedValues> {
  return (
    values,
    context,
    options
  ): ReturnType<Resolver<TFieldValues, TContext, TTransformedValues>> => {
    const description: unknown = values['description'];
    const hasText =
      typeof description === 'object' &&
      description !== null &&
      Object.values(description).some(
        (value) => typeof value === 'string' && value.trim() !== ''
      );
    return resolver(
      { ...values, description: hasText ? description : null },
      context,
      options
    );
  };
}

/**
 * Whether a record of texts holds nothing in every language it carries.
 *
 * A blank text is what a description looks like while nobody has written one,
 * and Core's canonical "no description" is `null` rather than a record of empty
 * strings.
 */
function holdsNoText(record: unknown): boolean {
  if (record === null || record === undefined) {
    return true;
  }
  if (typeof record !== 'object') {
    return false;
  }
  return Object.values(record).every(
    (text) => typeof text !== 'string' || text.trim() === ''
  );
}

/**
 * Wraps a resolver so a field definition whose description is blank in every
 * language reaches Core as `null`, its canonical "no description" value.
 *
 * Core makes a field definition's description nullable but refuses a
 * present-but-empty language, so a description somebody cleared again has to be
 * taken back to `null` rather than kept as `{ en: '' }`. It normalizes input to
 * Core's own canonical value and adds no rule of its own, so validation stays
 * entirely Core's.
 */
export function withBlankDefinitionDescriptionsAsNull<
  TFieldValues extends FieldValues,
  TContext,
  TTransformedValues extends FieldValues,
>(
  resolver: Resolver<TFieldValues, TContext, TTransformedValues>
): Resolver<TFieldValues, TContext, TTransformedValues> {
  return (
    values,
    context,
    options
  ): ReturnType<Resolver<TFieldValues, TContext, TTransformedValues>> => {
    const definitions: unknown = values['fieldDefinitions'];
    if (Array.isArray(definitions) === false) {
      return resolver(values, context, options);
    }

    const cleaned = (definitions as unknown[]).map((definition) => {
      if (typeof definition !== 'object' || definition === null) {
        return definition;
      }
      const record = definition as Record<string, unknown>;
      return holdsNoText(record['description'])
        ? { ...record, description: null }
        : definition;
    });

    return resolver({ ...values, fieldDefinitions: cleaned }, context, options);
  };
}
