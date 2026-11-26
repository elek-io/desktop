import { translatableDefault } from '@renderer/lib/utils';

import {
  type FieldDefinitionBase,
  type SupportedLanguage,
} from '@elek-io/core';

/**
 * What every field definition holds before its type's own settings, for a field
 * that has just been added.
 *
 * Kept here so a type's own `newDefinition` stays a line of deltas, and in a
 * module with no components in it so any folder can read it.
 */
export function baseDefaults(
  supportedLanguages: SupportedLanguage[]
): Omit<FieldDefinitionBase, 'id'> {
  return {
    slug: '',
    label: translatableDefault({ supportedLanguages, defaultValue: '' }),
    // No description at all rather than one that is blank in every language,
    // which is Core's own canonical "no description" and what a field starts
    // with until somebody writes one.
    description: null,
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
  };
}
