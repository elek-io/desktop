import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import React, { useId, type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { defaultEntryValues } from '@renderer/components/fields';
import { EntryForm } from '@renderer/components/forms/entry-form';
import { Page } from '@renderer/components/page';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useComponentResolver } from '@renderer/hooks/useComponentResolver';
import { useEntryRefusals } from '@renderer/hooks/useEntryRefusals';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { queryOptions } from '@renderer/queries';

import {
  type CreateEntryProps,
  flattenFieldDefinitions,
  getCreateEntrySchemaFromFieldDefinitions,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/create'
)({
  component: CreateEntryPage,
});

function CreateEntryPage(): React.JSX.Element {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId, collectionId } = Route.useParams();
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    translateContent,
  } = useProject();
  const { data: collection, isPending: isReadingCollection } = useQueryNoError(
    queryOptions.collections.read({
      projectId: projectId,
      id: collectionId,
    })
  );
  useBreadcrumb(Route, isReadingCollection ? undefined : t`Create`);
  // A dynamic field's Values are checked against the field definitions of the
  // Components it embeds, so the schema needs Core's resolver for them.
  const { componentResolver, isReadingComponents } =
    useComponentResolver(projectId);
  const generatedCreateEntrySchema =
    isReadingProject === false &&
    isReadingCollection === false &&
    isReadingComponents === false
      ? getCreateEntrySchemaFromFieldDefinitions(
          flattenFieldDefinitions(collection.fieldDefinitions),
          project.settings.language.supported,
          componentResolver
        )
      : getCreateEntrySchemaFromFieldDefinitions([], []);
  const formId = useId();
  const createEntryForm = useAppForm({
    resolver: zodResolver(generatedCreateEntrySchema),
    defaultValues: {
      projectId: projectId,
      collectionId: collectionId,
      values: {},
    },
    // A default Value per field definition, filled from the queries rather than
    // reset in an effect, so what is already typed survives a refetch.
    ...(isReadingProject || isReadingCollection
      ? {}
      : {
          values: {
            projectId: projectId,
            collectionId: collectionId,
            values: defaultEntryValues(
              flattenFieldDefinitions(collection.fieldDefinitions),
              project.settings.language.supported
            ),
          },
        }),
    disabled: isReadingProject || isReadingCollection,
  });

  // Each refusal Core answers a save with lands on its own field, in its
  // section and its language. See contributing/error-handling.md.
  const refusals = useEntryRefusals(createEntryForm);
  const {
    mutateAsync: createEntry,
    isPending: isCreatingEntry,
    handleError: handleRefusal,
  } = useAppMutation(queryOptions.entries.create, { handled: refusals });

  const onCreateEntry: SubmitHandler<CreateEntryProps> = async (props) => {
    try {
      await createEntry(props);
      await router.navigate({
        to: '/projects/$projectId/collections/$collectionId',
        params: {
          projectId,
          collectionId,
        },
      });
    } catch (error) {
      // A refusal that belongs on a field is marked there. Every other failure
      // was already routed to the boundary, so this is a no-op for it.
      handleRefusal(error);
    }
  };

  // The Collection's name in singular, or the domain term while the Collection
  // is still loading, so each sentence below takes one placeholder rather than
  // being assembled around it.
  const entryName = collection
    ? translateContent({
        key: 'currentCollection.name',
        record: collection.name.singular,
      })
    : t`Entry`;
  const title = t`Create a new ${entryName}`;

  function Description(): ReactElement {
    return (
      <>
        {collection
          ? translateContent({
              key: 'currentCollection.description',
              record: collection.description,
            })
          : ''}
      </>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={createEntryForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          <Trans>Create {entryName}</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  if (isReadingProject || isReadingCollection || isReadingComponents) {
    return <></>;
  }

  return (
    <>
      <Page title={title} description={<Description />} actions={<Actions />}>
        <EntryForm
          id={formId}
          entryForm={createEntryForm}
          fieldDefinitions={collection.fieldDefinitions}
          project={project}
          isViewOnly={isCreatingEntry}
          onFormSubmit={onCreateEntry}
        />
      </Page>
    </>
  );
}
