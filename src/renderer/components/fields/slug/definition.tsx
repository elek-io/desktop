import { zodResolver } from '@hookform/resolvers/zod';
import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import { useWatch } from 'react-hook-form';

import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';
import { SwitchControl } from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { Switch } from '@renderer/components/ui/switch';
import { useProject } from '@renderer/hooks/useProject';

import {
  flattenFieldDefinitions,
  slugFieldDefinitionSchema,
  uuid,
  type SlugFieldDefinition,
} from '@elek-io/core';

// Authoring for the slug field type. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// Its `ofFieldDefinitions` source list reads the other definitions already on
// the Collection (non-slug string fields) and stores their real ids, which Core's
// slugSourceReferencesSuperRefinement then validates. It is the only Extras that
// reads `fieldDefinitions` from DefinitionExtrasProps.

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

function SlugExtras({
  form,
  fieldDefinitions,
}: DefinitionExtrasProps<SlugFieldDefinition>): ReactElement {
  const { translateContent } = useProject();

  // Slugs can only derive from text-like sibling fields
  const eligibleSources = flattenFieldDefinitions(fieldDefinitions).filter(
    (definition) =>
      definition.valueType === 'string' && definition.fieldType !== 'slug'
  );

  const selectedSourceIds = useWatch({
    control: form.control,
    name: 'ofFieldDefinitions',
  });

  function toggleSource(sourceId: string): void {
    const next = selectedSourceIds.includes(sourceId)
      ? selectedSourceIds.filter((id) => id !== sourceId)
      : [...selectedSourceIds, sourceId];
    // Store the sources in the order their fields appear in the Collection,
    // so the derived slug is predictable no matter the toggle order
    form.setValue(
      'ofFieldDefinitions',
      eligibleSources
        .filter((definition) => next.includes(definition.id))
        .map((definition) => definition.id)
    );
  }

  return (
    <>
      <AppField
        form={form}
        name="ofFieldDefinitions"
        label={<Trans>Generate from Fields</Trans>}
        description={
          <Trans>
            The slug is generated from the selected Fields while creating an
            Entry, in the order the Fields appear in the Collection. If none are
            selected, users enter the slug manually.
          </Trans>
        }
      >
        {/* A list of switches rather than one control, so the group carries the
        association props and each switch names its own Field. */}
        {({ controlProps }) => (
          <div className="space-y-2" {...controlProps}>
            {eligibleSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Trans>
                  No text based Fields to generate from yet. Add one first or
                  leave this empty.
                </Trans>
              </p>
            ) : (
              eligibleSources.map((definition) => (
                <div
                  key={definition.id}
                  className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs"
                >
                  <div className="mr-4">
                    <span className="text-sm font-medium">
                      {translateContent({
                        key: 'fieldDefinition.label',
                        record: definition.label,
                      })}
                    </span>
                  </div>
                  <Switch
                    aria-label={translateContent({
                      key: 'fieldDefinition.label',
                      record: definition.label,
                    })}
                    checked={selectedSourceIds.includes(definition.id)}
                    onCheckedChange={() => toggleSource(definition.id)}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </AppField>

      <AppField
        form={form}
        name="separator"
        label={<Trans>Separator</Trans>}
        required
        description={
          <Trans>The character placed between words of the slug.</Trans>
        }
      >
        {({ field, controlProps }) => (
          <Select
            items={separatorItems()}
            value={field.value === '' ? NO_SEPARATOR : field.value}
            onValueChange={(selected) =>
              field.onChange(selected === NO_SEPARATOR ? '' : selected)
            }
            {...controlProps}
          >
            <SelectTrigger>
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
        name="lowercase"
        label={<Trans>Lowercase</Trans>}
        required
        description={<Trans>Convert the slug to lowercase.</Trans>}
        orientation="horizontal"
        className="gap-4 rounded-lg border border-border p-3 shadow-xs"
      >
        {({ field, controlProps }) => (
          <SwitchControl field={field} {...controlProps} />
        )}
      </AppField>

      <AppField
        form={form}
        name="decamelize"
        label={<Trans>Decamelize</Trans>}
        required
        description={
          <Trans>
            Split camelCase words, so &quot;myWord&quot; becomes
            &quot;my-word&quot;.
          </Trans>
        }
        orientation="horizontal"
        className="gap-4 rounded-lg border border-border p-3 shadow-xs"
      >
        {({ field, controlProps }) => (
          <SwitchControl field={field} {...controlProps} />
        )}
      </AppField>
    </>
  );
}

const slugSpec: DefinitionSpec<SlugFieldDefinition> = {
  resolver: zodResolver(slugFieldDefinitionSchema),
  // Slugs are always unique and have no default value; the separator/lowercase/
  // decamelize deltas and the (initially empty) source list round out the type.
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'string',
    fieldType: 'slug',
    isUnique: true,
    defaultValue: null,
    separator: '-',
    lowercase: true,
    decamelize: true,
    ofFieldDefinitions: [],
  }),
  Extras: SlugExtras,
};

/**
 * The slug authoring entry. A normal DefinitionDraft over the slug spec; the
 * sibling definitions the source picker needs arrive through the widened
 * DefinitionDraftProps and are ignored by every other type.
 */
export function SlugDefinitionDraft(props: DefinitionDraftProps): ReactElement {
  return <DefinitionDraft {...props} spec={slugSpec} />;
}
