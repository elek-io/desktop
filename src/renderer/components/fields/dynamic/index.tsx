import { noTitle } from '@renderer/components/fields/value-contracts';

import { resolveOfComponents } from '@elek-io/core';

import { type FieldTypeModule } from '../module';
import { AllowComponentsSheet } from './allow-components-sheet';
import { DynamicControl } from './control';
import { DynamicDefinitionDraft } from './definition';

/**
 * The sections of a page: an ordered list of Component items, each holding that
 * Component's own Values.
 *
 * It is the one type whose Value is a flat array rather than content per
 * language, which is why it alone is not translatable.
 */
export const dynamicField: FieldTypeModule<'dynamic'> = {
  translatable: false,
  // A list of sections is not one control, so required is said in its label.
  acceptsAriaRequired: false,
  Control: ({ field, fieldDefinition, disabled, controlProps }) => (
    <DynamicControl
      field={field}
      fieldDefinition={fieldDefinition}
      disabled={disabled}
      {...controlProps}
    />
  ),
  // A page starts with no sections. Core's schema still demands at least one
  // for a required dynamic field, so an empty list surfaces on the field rather
  // than being pre-filled with a section nobody asked for.
  defaultContent: () => [],
  previewContent: () => null,
  // Sections cannot be shown in a row of the list of Entries.
  listCell: () => undefined,
  titleText: noTitle,
  // An empty `ofComponents` allows every Component of the Project, which is
  // Core's own rule rather than ours, so it is read off Core.
  allowedComponentIds: (fieldDefinition, everyComponentId) => [
    ...resolveOfComponents(fieldDefinition, everyComponentId),
  ],
  // The one part of a definition that can be edited after it was added: which
  // Components a section may be built from.
  EditSheet: ({ fieldDefinition, onChange, onClose }) => (
    <AllowComponentsSheet
      fieldDefinition={fieldDefinition}
      onAllow={onChange}
      onClose={onClose}
    />
  ),
  DefinitionDraft: (props) => <DynamicDefinitionDraft {...props} />,
};
