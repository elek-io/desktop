import { zodResolver } from '@hookform/resolvers/zod';
import { msg, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import {
  contentInLanguage,
  noTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';
import { SwitchControl } from '@renderer/components/ui/field-controls';
import { alwaysFilledFieldRules } from '@renderer/lib/fieldRules';

import {
  toggleFieldDefinitionSchema,
  uuid,
  type ToggleFieldDefinition,
} from '@elek-io/core';

import { type FieldTypeModule } from '../module';

const spec: DefinitionSpec<ToggleFieldDefinition> = {
  requiredNote: msg`Toggles are always required, since they can only be checked or unchecked.`,
  uniquenessNote: msg`Toggles cannot be unique, since they can only be checked or unchecked.`,
  schema: toggleFieldDefinitionSchema,

  resolver: zodResolver(toggleFieldDefinitionSchema),
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'boolean',
    fieldType: 'toggle',
    defaultValue: false,
    isRequired: true,
    isUnique: false,
  }),
  Extras: ({ form }) => (
    <AppField
      form={form}
      name="defaultValue"
      label={<Trans>Default value</Trans>}
      orientation="horizontal"
      description={<Trans>The initial value for the field.</Trans>}
      className="gap-4 rounded-lg border border-border p-3 shadow-xs"
    >
      {({ field, controlProps }) => (
        <SwitchControl field={field} {...controlProps} />
      )}
    </AppField>
  ),
};

/** A switch that is either on or off. */
export const toggleField: FieldTypeModule<'toggle'> = {
  translatable: true,
  // A switch carries the `switch` role, which Base UI draws as a button, so it
  // takes no `aria-required`.
  acceptsAriaRequired: false,
  // A toggle is always on or off, so it shows no rule, as ci rules.
  rules: alwaysFilledFieldRules,
  Control: ({ field, disabled, controlProps }) => (
    <SwitchControl field={field} disabled={disabled} {...controlProps} />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: (fieldDefinition) => fieldDefinition.defaultValue,
  isEmpty: holdsNothing,
  // A toggle holds a Value as soon as it has one, and a language a Project
  // gained has none at all, which Core refuses like any other missing Value. So
  // the field is marked there, and what the default language is set to is read
  // below it as the word the switch stands for.
  renderValue: ({ content, language }) => {
    const value = contentInLanguage(content, language);
    if (typeof value !== 'boolean') {
      return null;
    }
    return value ? t`On` : t`Off`;
  },
  titleText: noTitle,
  DefinitionDraft: (props) => <DefinitionDraft {...props} spec={spec} />,
};
