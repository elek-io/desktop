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

// The settings of an entry field. See
// contributing/renderer/dynamic-form-field-generation.md.
//
// The Collections it allows are read from a list query of their own, which
// stays inside this folder so nothing above it learns about a query.

/**
 * The settings of an entry field: which Collections it points into, and how
 * many Entries it takes.
 */
export function EntryDefinitionEditor<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  fieldDefinition,
  path,
  set,
}: DefinitionBinding<'entry', TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();
  const { projectId, translateContent } = useProject();
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));
  const collections = isReadingCollections ? [] : collectionList.list;
  const chosenIds = fieldDefinition.ofCollections;
  const collectionName = (id: string): string => {
    const collection = collections.find((candidate) => candidate.id === id);
    if (collection === undefined) {
      return t`A Collection that is gone`;
    }
    return translateContent({
      key: 'collection.name.plural',
      record: collection.name.plural,
    });
  };
  const label = t`From Collections`;

  return (
    <>
      <DefinitionChoiceRows
        form={form}
        name={path('ofCollections')}
        label={label}
        labelText={label}
        description={
          <Trans>
            Editors can only point at an Entry of these Collections. Every
            Collection is allowed while this is empty.
          </Trans>
        }
        chosen={chosenIds.map((id) => ({ key: id, title: collectionName(id) }))}
        offered={collections
          .filter((collection) => chosenIds.includes(collection.id) === false)
          .map((collection) => ({
            key: collection.id,
            title: translateContent({
              key: 'collection.name.plural',
              record: collection.name.plural,
            }),
          }))}
        addLabel={t`Add Collection`}
        emptyNote={<Trans>Every Collection is allowed.</Trans>}
        nothingToAddNote={
          collections.length === 0 ? (
            <Trans>This Project holds no other Collection yet.</Trans>
          ) : undefined
        }
        onAdd={(id) => set('ofCollections', [...chosenIds, id])}
        onRemove={(id) =>
          set(
            'ofCollections',
            chosenIds.filter((chosen) => chosen !== id)
          )
        }
      />
      <DefinitionBounds
        form={form}
        minName={path('min')}
        maxName={path('max')}
        description={<Trans>The number of Entries editors can choose.</Trans>}
      />
    </>
  );
}
