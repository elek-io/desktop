import {
  useForm,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';

/**
 * Every form's `useForm`.
 *
 * It pins the one option a form filled from a query must not forget:
 * `keepDirtyValues`, so a refetch that arrives while somebody is typing never
 * overwrites what they typed. Pass the loaded object as `values` and the
 * query's pending state as `disabled`, rather than calling `reset()` in an
 * effect. A lint rule keeps `useForm` itself to this file.
 *
 * See contributing/renderer/loading-and-updating-data.md.
 */
export function useAppForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>(
  props: UseFormProps<TFieldValues, unknown, TTransformedValues>
): UseFormReturn<TFieldValues, unknown, TTransformedValues> {
  return useForm<TFieldValues, unknown, TTransformedValues>({
    ...props,
    resetOptions: { keepDirtyValues: true, ...props.resetOptions },
  });
}
