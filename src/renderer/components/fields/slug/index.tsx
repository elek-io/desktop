import { t } from '@lingui/core/macro';

import { coreRefusals } from '@renderer/components/fields/core-refusals';
import { holdsNothing } from '@renderer/components/fields/empty-values';
import { scalarRules } from '@renderer/components/fields/rules';
import {
  storedText,
  emptyPreview,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';

import { slug } from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { SlugControl } from './control';
import { SlugDefinitionDraft } from './definition';

/**
 * A machine readable name, derived from other fields of the same Entry.
 *
 * Core forbids one inside a Component, because uniqueness is enforced over a
 * Collection's top level fields only.
 */
export const slugField: FieldTypeModule<'slug'> = {
  translatable: true,
  acceptsAriaRequired: true,
  rules: scalarRules,
  forbiddenInComponent: true,
  Control: ({ field, fieldDefinition, disabled, controlProps }) => (
    <SlugControl
      field={field}
      fieldDefinition={fieldDefinition}
      disabled={disabled}
      {...controlProps}
    />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: emptyPreview,
  isEmpty: holdsNothing,
  renderValue: storedText,
  titleText: textTitle,
  // A slug is the one definition that points at sibling definitions, so it is
  // the one that has to forget a definition the editor removed. Core's
  // slugSourceReferencesSuperRefinement rejects a source id that no longer
  // exists, and an error on the definitions array has no control to land on, so
  // a stale id would block every later save with no visible reason.
  // Core refuses text that holds nothing a slug can be made of, and a slug
  // that is not yet in the form this field's settings ask for. The second says
  // the form it needs, worked out with Core's own helper and this field's own
  // settings, which is what the control does when the field is left.
  coreRefusalText: ({ message, fieldDefinition, content }) => {
    if (message.startsWith(coreRefusals.unusableSlug)) {
      return t`Use letters or numbers, so this can be part of a web address.`;
    }
    if (message.startsWith(coreRefusals.nonCanonicalSlug) === false) {
      return null;
    }

    const canonical =
      typeof content === 'string'
        ? slug(content, {
            separator: fieldDefinition.separator,
            lowercase: fieldDefinition.lowercase,
            decamelize: fieldDefinition.decamelize,
          })
        : '';

    return canonical === ''
      ? null
      : t`This field needs "${canonical}" instead.`;
  },
  withoutDefinition: (fieldDefinition, removedDefinitionId) =>
    fieldDefinition.ofFieldDefinitions.includes(removedDefinitionId)
      ? {
          ...fieldDefinition,
          ofFieldDefinitions: fieldDefinition.ofFieldDefinitions.filter(
            (sourceId) => sourceId !== removedDefinitionId
          ),
        }
      : fieldDefinition,
  DefinitionDraft: (props) => <SlugDefinitionDraft {...props} />,
};
