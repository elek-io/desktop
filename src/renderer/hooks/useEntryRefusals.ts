import { useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

import { type CoreErrorHandlers } from '@renderer/hooks/useAppMutation';
import {
  entryReferenceIssuesOf,
  entryValuePath,
  uniqueValueConflictsOf,
  type EntryReferenceIssue,
  type EntryRefusalLocation,
} from '@renderer/lib/entryRefusals';

// The one map of the refusals an Entry form answers: a Value another Entry
// already holds, a reference that points at nothing, and an Asset of a type
// the field does not take. Each lands below its own field, in its section and
// its language, which is where ci's Messages table puts a field that is wrong.
//
// A refusal of one of those types whose details name no field this form holds
// is thrown on, so it still reaches the root error boundary rather than being
// swallowed or shown on a field it is not about.
//
// See contributing/error-handling.md.

/** What one refusal says, and where it belongs. */
interface PlacedRefusal {
  location: EntryRefusalLocation;
  message: string;
}

/**
 * The `handled` map for an Entry's create or update mutation.
 *
 * Both routes read it from here, so the two forms answer the same refusals the
 * same way.
 */
export function useEntryRefusals<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>(
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>
): CoreErrorHandlers {
  const { t } = useLingui();

  /**
   * Marks each refusal on its own field, or throws the error on when not one
   * of them names a field this form holds.
   */
  const place = (refusals: PlacedRefusal[], error: unknown): void => {
    // The whole form, so the helper reads the sections' ids out of it without
    // this hook naming a path of its own.
    const formValues: unknown = form.getValues();
    let placed = 0;

    for (const refusal of refusals) {
      const path = entryValuePath(refusal.location, formValues);
      if (path === null) {
        continue;
      }
      // Focus is deliberately left where it is: the fields of a form that is
      // saving are disabled, and a disabled control cannot take focus, so
      // asking for it here would only sometimes work. The message carries
      // `role="alert"`, so it is announced where it stands.
      form.setError(
        // Built from the field definition Core names, which this form is
        // generated from, so only the name is asserted and never the form,
        // see contributing/renderer/forms.md#form-typing.
        path as FieldPath<TFieldValues>,
        { type: 'core', message: refusal.message }
      );
      placed += 1;
    }

    if (placed === 0) {
      throw error;
    }
  };

  const referenceMessage = (issue: EntryReferenceIssue): string => {
    if (issue.kind === 'asset_mime_mismatch') {
      return t`This field does not take an Asset of that type. Choose another one.`;
    }
    return issue.refKind === 'entry'
      ? t`An Entry this field points at no longer exists. Choose another one.`
      : t`An Asset this field points at no longer exists. Choose another one.`;
  };

  return {
    Conflict: (error) => {
      const { cause } = parseIpcError(error);
      place(
        uniqueValueConflictsOf(cause).map((conflict) => ({
          location: conflict,
          message: t`Another Entry already uses this Value. Change it to save.`,
        })),
        error
      );
    },
    BadRequest: (error) => {
      const { cause } = parseIpcError(error);
      place(
        entryReferenceIssuesOf(cause).map((issue) => ({
          location: issue,
          message: referenceMessage(issue),
        })),
        error
      );
    },
  };
}
