import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { baseDefaults } from '@renderer/components/forms/field-definition-defaults';
import {
  DefinitionDraft,
  type DefinitionDraftProps,
  type DefinitionExtrasProps,
  type DefinitionSpec,
} from '@renderer/components/forms/field-definition-draft';
import { AppField } from '@renderer/components/ui/app-form';
import { TextControl } from '@renderer/components/ui/field-controls';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { Switch } from '@renderer/components/ui/switch';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  dynamicFieldDefinitionSchema,
  uuid,
  type Component,
  type DynamicFieldDefinition,
} from '@elek-io/core';

// Authoring for the dynamic field type, the one field whose Value is a list of
// Component items rather than content per language. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// The ofComponents picker is backed by a Components list query, modelled on the
// entry field's ofCollections picker. That query and its projectId hook stay
// inside the picker, so the shared engine never learns about queries.

export interface OfComponentsPickerProps {
  form: UseFormReturn<DynamicFieldDefinition>;
  /**
   * The Components the Field allows already. Each is named as allowed instead
   * of being offered again, because taking one away deletes the sections built
   * from it, which no screen can answer yet (see
   * contributing/not-yet-implemented.md). Empty while a Field is being added,
   * where every Component is offered.
   */
  lockedComponentIds?: readonly string[];
}

/**
 * The `ofComponents` picker: one switch per Component the Field can still be
 * given, and the ones it allows already named in words above them.
 *
 * It is the one picker both paths use, the Add Field sheet and the sheet that
 * grows an existing Field, so what either offers is decided here rather than
 * twice.
 */
export function OfComponentsPicker({
  form,
  lockedComponentIds = [],
}: OfComponentsPickerProps): ReactElement {
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
        : [...selectedComponentIds, componentId],
      // Without this the switch would leave the form pristine, and a submit
      // gated on the form being dirty would stay disabled.
      { shouldDirty: true }
    );
  }

  function componentName(component: Component): string {
    return translateContent({
      key: 'component.name',
      record: component.name,
    });
  }

  const components = isReadingComponents ? [] : componentList.list;
  const allowedAlready = components.filter((component) =>
    lockedComponentIds.includes(component.id)
  );
  const offered = components.filter(
    (component) => lockedComponentIds.includes(component.id) === false
  );

  return (
    <AppField
      form={form}
      name="ofComponents"
      label={<Trans>Allowed Components</Trans>}
      description={
        lockedComponentIds.length === 0 ? (
          <Trans>
            Only the selected Components can be added as a section. If none are
            selected, every Component of this Project can be.
          </Trans>
        ) : (
          <Trans>
            Select the Components to allow as well. The ones allowed already are
            listed rather than offered, since taking one away is not possible
            yet.
          </Trans>
        )
      }
    >
      {({ controlProps }) => (
        <div className="space-y-2" {...controlProps}>
          {allowedAlready.length > 0 ? (
            <>
              <p className="text-sm">
                <Trans>Allowed already:</Trans>
              </p>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {allowedAlready.map((component) => (
                  <li key={component.id}>{componentName(component)}</li>
                ))}
              </ul>
            </>
          ) : null}
          {isReadingComponents === true ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => {
                const key = `skeleton-${String(i)}`;
                return <Skeleton key={key} className="h-10 rounded-md" />;
              })}
            </div>
          ) : offered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {lockedComponentIds.length === 0 ? (
                <Trans>
                  This Project has no Components yet. Create one first, then
                  come back to choose it here.
                </Trans>
              ) : (
                <Trans>
                  Every Component of this Project is allowed already, so there
                  is nothing to add.
                </Trans>
              )}
            </p>
          ) : (
            offered.map((component) => {
              const name = componentName(component);
              return (
                <div
                  key={component.id}
                  className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-xs"
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
      )}
    </AppField>
  );
}

function DynamicExtras({
  form,
}: DefinitionExtrasProps<DynamicFieldDefinition>): ReactElement {
  return (
    <>
      <OfComponentsPicker form={form} />

      <div className="flex flex-row items-center justify-between space-x-2">
        <AppField
          form={form}
          name="min"
          label={<Trans>Minimum</Trans>}
          description={
            <Trans>The minimum number of sections the user needs to add.</Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
        <AppField
          form={form}
          name="max"
          label={<Trans>Maximum</Trans>}
          description={
            <Trans>
              The maximum number of sections the user is able to add.
            </Trans>
          }
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="number" {...controlProps} />
          )}
        </AppField>
      </div>
    </>
  );
}

const dynamicSpec: DefinitionSpec<DynamicFieldDefinition> = {
  uniquenessNote: msg`Dynamic fields cannot be unique.`,
  schema: dynamicFieldDefinitionSchema,

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
