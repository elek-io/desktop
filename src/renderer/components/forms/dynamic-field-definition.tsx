import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement } from 'react';
import { useWatch } from 'react-hook-form';

import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { FieldLegend, FieldSet } from '@renderer/components/ui/field';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { Switch } from '@renderer/components/ui/switch';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  dynamicFieldDefinitionSchema,
  uuid,
  type DynamicFieldDefinition,
} from '@elek-io/core';

// Authoring for the dynamic field type, the one field whose Value is a list of
// Component items rather than content per language. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// The ofComponents picker is backed by a Components list query, modelled on the
// entry field's ofCollections picker. That query and its projectId hook stay
// inside the Extras component, so the shared engine never learns about queries.

function DynamicExtras({
  form,
}: DefinitionExtrasProps<DynamicFieldDefinition>): ReactElement {
  const { projectId, translateContent } = useProject();
  const { data: componentList, isPending: isReadingComponents } =
    useQueryNoError(queryOptions.components.list({ projectId, limit: 0 }));

  const selectedComponentIds = useWatch({
    control: form.control,
    name: 'ofComponents',
  });

  function toggleComponent(componentId: string): void {
    form.setValue(
      'ofComponents',
      selectedComponentIds.includes(componentId)
        ? selectedComponentIds.filter((id) => id !== componentId)
        : [...selectedComponentIds, componentId]
    );
  }

  return (
    <>
      <FormField
        control={form.control}
        name="ofComponents"
        render={() => (
          <FormItem>
            <FieldSet className="gap-2">
              <FieldLegend variant="label" className="mb-0">
                Allowed Components
              </FieldLegend>
              <FormDescription>
                Only the selected Components can be added as a section. If none
                are selected, every Component of this Project can be.
              </FormDescription>
              <div className="space-y-2">
                {isReadingComponents === true ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => {
                      const key = `skeleton-${String(i)}`;
                      return <Skeleton key={key} className="h-10 rounded-md" />;
                    })}
                  </div>
                ) : componentList.list.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This Project has no Components yet. Create one first, then
                    come back to choose it here.
                  </p>
                ) : (
                  componentList.list.map((component) => {
                    const name = translateContent({
                      key: 'component.name',
                      record: component.name,
                    });
                    return (
                      <div
                        key={component.id}
                        className="flex flex-row items-center justify-between rounded-lg border border-zinc-200 p-3 shadow-xs dark:border-zinc-700"
                      >
                        <div className="mr-4">
                          <span className="text-sm font-medium">{name}</span>
                        </div>
                        <Switch
                          aria-label={name}
                          checked={selectedComponentIds.includes(component.id)}
                          onCheckedChange={() => toggleComponent(component.id)}
                        />
                      </div>
                    );
                  })
                )}
              </div>
              <FormMessage />
            </FieldSet>
          </FormItem>
        )}
      />

      <div className="flex flex-row items-center justify-between space-x-2">
        <FormField
          control={form.control}
          name="min"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Minimum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The minimum number of sections the user needs to add.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="max"
          render={({ field }) => (
            <FormItem>
              <FormLabel isRequired={false}>Maximum</FormLabel>
              <FormControl>
                <FormInputField field={field} type="number" />
              </FormControl>
              <FormDescription>
                The maximum number of sections the user is able to add.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}

const dynamicSpec: DefinitionSpec<DynamicFieldDefinition> = {
  authorableFieldType: 'dynamic',
  resolver: zodResolver(dynamicFieldDefinitionSchema),
  // Core pins isUnique to false for a dynamic field, so it is re-narrowed here
  // to that literal. An empty ofComponents means every Component is allowed.
  makeDefaults: (langs) => ({
    ...baseDefaults(langs),
    id: uuid(),
    valueType: 'component',
    fieldType: 'dynamic',
    isUnique: false,
    ofComponents: [],
    min: null,
    max: null,
  }),
  Extras: DynamicExtras,
};

/** The dynamic authoring entry: a DefinitionDraft over the dynamic spec. */
export function DynamicDefinitionDraft(
  props: DefinitionDraftProps
): ReactElement {
  return <DefinitionDraft {...props} spec={dynamicSpec} />;
}
