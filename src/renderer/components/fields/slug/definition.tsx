import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import { type FieldValues } from 'react-hook-form';

import { type DefinitionBinding } from '@renderer/components/fields/module';
import { DefinitionChoiceRows } from '@renderer/components/forms/definition-controls';
import { AppField } from '@renderer/components/ui/app-form';
import { CheckboxControl } from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useProject } from '@renderer/hooks/useProject';

import { flattenFieldDefinitions } from '@elek-io/core';

// The settings of a slug field. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// Its source list reads the other definitions of the same object, the non-slug
// text fields among them, and stores their real ids, which Core's
// slugSourceReferencesSuperRefinement then checks.

// A select item cannot hold an empty string, so "no separator" needs a sentinel
// eslint-disable-next-line lingui/no-unlocalized-strings
const NO_SEPARATOR = 'none';
const separatorOptions: { value: string; label: MessageDescriptor }[] = [
  { value: '-', label: msg`Hyphen (-)` },
  { value: '_', label: msg`Underscore (_)` },
  { value: '.', label: msg`Dot (.)` },
  { value: '~', label: msg`Tilde (~)` },
  { value: NO_SEPARATOR, label: msg`None` },
];

/** The separators as a select's value-to-label map, read when it is shown. */
function separatorItems(): Record<string, string> {
  return Object.fromEntries(
    separatorOptions.map((option) => [option.value, i18n._(option.label)])
  );
}

/**
 * The settings of a slug field: which fields it is made from, and the form the
 * slug is written in.
 */
export function SlugDefinitionEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  fieldDefinition,
  path,
  set,
  siblings,
}: DefinitionBinding<'slug', TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();
  const { translateContent } = useProject();
  // A slug can only be made of text fields that are not slugs themselves,
  // which is what Core allows as a source.
  const sources = flattenFieldDefinitions(siblings).filter(
    (definition) =>
      definition.valueType === 'string' &&
      definition.fieldType !== 'slug' &&
      definition.id !== fieldDefinition.id
  );
  const chosenIds = fieldDefinition.ofFieldDefinitions;
  const sourceTitle = (id: string): string => {
    const source = sources.find((definition) => definition.id === id);
    if (source === undefined) {
      return t`A field that is gone`;
    }
    return translateContent({
      key: 'fieldDefinition.label',
      record: source.label,
    });
  };
  const madeFrom = t`Made from`;

  return (
    <>
      <DefinitionChoiceRows
        form={form}
        name={path('ofFieldDefinitions')}
        label={madeFrom}
        labelText={madeFrom}
        description={
          <Trans>
            The slug is written from these fields, in this order, while an Entry
            is created.
          </Trans>
        }
        chosen={chosenIds.map((id) => ({ key: id, title: sourceTitle(id) }))}
        offered={sources
          .filter((definition) => chosenIds.includes(definition.id) === false)
          .map((definition) => ({
            key: definition.id,
            title: translateContent({
              key: 'fieldDefinition.label',
              record: definition.label,
            }),
          }))}
        addLabel={t`Add field`}
        emptyNote={
          <Trans>Editors write the slug themselves while this is empty.</Trans>
        }
        nothingToAddNote={
          sources.length === 0 ? (
            <Trans>Add a text field first, then come back to choose it.</Trans>
          ) : undefined
        }
        onAdd={(id) =>
          // Kept in the order the fields stand in, so the slug reads the same
          // however the sources were picked.
          set(
            'ofFieldDefinitions',
            sources
              .filter(
                (definition) =>
                  definition.id === id || chosenIds.includes(definition.id)
              )
              .map((definition) => definition.id)
          )
        }
        onRemove={(id) =>
          set(
            'ofFieldDefinitions',
            chosenIds.filter((chosen) => chosen !== id)
          )
        }
      />

      <AppField
        form={form}
        name={path('separator')}
        label={<Trans>Separator</Trans>}
        description={<Trans>What stands between the words of the slug.</Trans>}
      >
        {({ field, controlProps, disabled }) => (
          <Select
            items={separatorItems()}
            value={field.value === '' ? NO_SEPARATOR : field.value}
            onValueChange={(selected) =>
              field.onChange(selected === NO_SEPARATOR ? '' : selected)
            }
            disabled={disabled}
          >
            {/* The trigger is the real focusable control, so the
            control-association props land there rather than on the root, which
            forwards none of them. */}
            <SelectTrigger {...controlProps}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {separatorOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {i18n._(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </AppField>

      <AppField
        form={form}
        name={path('lowercase')}
        label={<Trans>Lowercase</Trans>}
        orientation="horizontal"
        description={<Trans>Writes the slug in small letters.</Trans>}
      >
        {({ field, controlProps }) => (
          <CheckboxControl field={field} {...controlProps} />
        )}
      </AppField>

      <AppField
        form={form}
        name={path('decamelize')}
        label={<Trans>Decamelize</Trans>}
        orientation="horizontal"
        description={
          <Trans>
            Splits camelCase words, so &quot;myWord&quot; becomes
            &quot;my-word&quot;.
          </Trans>
        }
      >
        {({ field, controlProps }) => (
          <CheckboxControl field={field} {...controlProps} />
        )}
      </AppField>
    </>
  );
}
