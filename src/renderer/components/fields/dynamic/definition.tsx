import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
import { type FieldValues } from 'react-hook-form';

import { type DefinitionBinding } from '@renderer/components/fields/module';
import {
  DefinitionBounds,
  DefinitionChoiceRows,
} from '@renderer/components/forms/definition-controls';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

// The settings of a dynamic field, the one field whose Value is a list of
// Component items rather than content per language. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// The Components it allows are read from a list query of their own, which stays
// inside this folder so nothing above it learns about a query.

/**
 * The settings of a dynamic field: which Components a section may be built
 * from, and how many sections it takes.
 *
 * Taking a Component away deletes every section built from it, which Core
 * refuses until that loss is accepted, and a refused save changes nothing, see
 * contributing/not-yet-implemented.md.
 */
export function DynamicDefinitionEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  fieldDefinition,
  path,
  set,
}: DefinitionBinding<
  'dynamic',
  TFieldValues,
  TTransformedValues
>): ReactElement {
  const { t } = useLingui();
  const { projectId, translateContent } = useProject();
  const { data: componentList, isPending: isReadingComponents } =
    useQueryNoError(queryOptions.components.list({ projectId, limit: 0 }));
  const components = isReadingComponents ? [] : componentList.list;
  const chosenIds = fieldDefinition.ofComponents;
  const componentName = (id: string): string => {
    const component = components.find((candidate) => candidate.id === id);
    if (component === undefined) {
      return t`A Component that is gone`;
    }
    return translateContent({ key: 'component.name', record: component.name });
  };
  const label = t`Allowed Components`;

  return (
    <>
      <DefinitionChoiceRows
        form={form}
        name={path('ofComponents')}
        label={label}
        labelText={label}
        description={
          <Trans>
            Editors can only add a section built from these Components. Every
            Component is allowed while this is empty.
          </Trans>
        }
        chosen={chosenIds.map((id) => ({ key: id, title: componentName(id) }))}
        offered={components
          .filter((component) => chosenIds.includes(component.id) === false)
          .map((component) => ({
            key: component.id,
            title: translateContent({
              key: 'component.name',
              record: component.name,
            }),
          }))}
        addLabel={t`Add Component`}
        emptyNote={<Trans>Every Component is allowed.</Trans>}
        nothingToAddNote={
          components.length === 0 ? (
            <Trans>
              This Project holds no Component yet. Create one first, then come
              back to choose it.
            </Trans>
          ) : undefined
        }
        onAdd={(id) => set('ofComponents', [...chosenIds, id])}
        onRemove={(id) =>
          set(
            'ofComponents',
            chosenIds.filter((chosen) => chosen !== id)
          )
        }
      />
      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={<Trans>The number of sections editors can add.</Trans>}
      />
    </>
  );
}
