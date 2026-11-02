import {
  contentAsStored,
  emptyPreview,
  textTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';

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
  listCell: contentAsStored,
  titleText: textTitle,
  // A slug is the one definition that points at sibling definitions, so it is
  // the one that has to forget a definition the editor removed. Core's
  // slugSourceReferencesSuperRefinement rejects a source id that no longer
  // exists, and an error on the definitions array has no control to land on, so
  // a stale id would block every later save with no visible reason.
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
