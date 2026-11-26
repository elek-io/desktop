import { msg, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { ToggleLeftIcon } from 'lucide-react';

import { holdsNothing } from '@renderer/components/fields/empty-values';
import {
  contentInLanguage,
  noTitle,
  translatableContent,
} from '@renderer/components/fields/value-contracts';
import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import { AppField } from '@renderer/components/ui/app-form';
import { SwitchControl } from '@renderer/components/ui/field-controls';
import { alwaysFilledFieldRules } from '@renderer/lib/fieldRules';

import { toggleFieldDefinitionSchema } from '@elek-io/core';

import { type FieldTypeModule } from '../module';

/** A switch that is either on or off. */
export const toggleField: FieldTypeModule<'toggle'> = {
  translatable: true,
  // A switch carries the `switch` role, which Base UI draws as a button, so it
  // takes no `aria-required`.
  acceptsAriaRequired: false,
  Icon: ToggleLeftIcon,
  group: 'choices',
  // A toggle is always on or off, so it shows no rule, as ci rules.
  rules: alwaysFilledFieldRules,
  Control: ({ field, disabled, controlProps }) => (
    <SwitchControl field={field} disabled={disabled} {...controlProps} />
  ),
  defaultContent: (fieldDefinition, supportedLanguages) =>
    translatableContent(fieldDefinition.defaultValue, supportedLanguages),
  previewContent: (fieldDefinition) => fieldDefinition.defaultValue,
  isEmpty: holdsNothing,
  // On or off, which ci marks whole rather than word by word.
  readsAsWords: false,
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
  requiredNote: () =>
    msg`A toggle is always required, since it is either on or off.`,
  uniquenessNote: () =>
    msg`A toggle can't be unique, since it is either on or off.`,
  definitionSchema: () => toggleFieldDefinitionSchema,
  newDefinition: ({ id, supportedLanguages }) => ({
    ...baseDefaults(supportedLanguages),
    id,
    valueType: 'boolean',
    fieldType: 'toggle',
    defaultValue: false,
    isRequired: true,
    isUnique: false,
  }),
  DefinitionEditor: ({ form, path }) => (
    <AppField
      form={form}
      name={path('defaultValue')}
      label={<Trans>Default Value</Trans>}
      orientation="horizontal"
      description={
        <Trans>Every new Entry starts with it, in every language.</Trans>
      }
    >
      {({ field, controlProps }) => (
        <SwitchControl field={field} {...controlProps} />
      )}
    </AppField>
  ),
};
