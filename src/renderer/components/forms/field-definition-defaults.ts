import { translatableDefault } from '@renderer/lib/utils';

import {
  type FieldDefinitionBase,
  type SupportedLanguage,
} from '@elek-io/core';

/**
 * The fields every field definition shares before its type specific extras.
 * Centralised here so a per-type `makeDefaults` stays a one-liner of deltas, and
 * kept in a component-free module so it can be imported by any authoring file.
 */
export function baseDefaults(
  supportedLanguages: SupportedLanguage[]
): Omit<FieldDefinitionBase, 'id'> {
  return {
    slug: '',
    label: translatableDefault({ supportedLanguages, defaultValue: '' }),
    description: translatableDefault({ supportedLanguages, defaultValue: '' }),
    isRequired: true,
    isDisabled: false,
    isUnique: false,
    inputWidth: '12',
  };
}
