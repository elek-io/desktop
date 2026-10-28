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
