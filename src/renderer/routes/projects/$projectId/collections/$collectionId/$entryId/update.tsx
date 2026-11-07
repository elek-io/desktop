import { zodResolver } from '@hookform/resolvers/zod';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useId, type ReactElement } from 'react';
import { useWatch, type SubmitHandler } from 'react-hook-form';

import { defaultEntryValues } from '@renderer/components/fields';
import { entryTitle } from '@renderer/components/fields/entry-title';
import { missingRequiredValues } from '@renderer/components/fields/missing-values';
import { EntryForm } from '@renderer/components/forms/entry-form';
import { Page } from '@renderer/components/page';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useComponentResolver } from '@renderer/hooks/useComponentResolver';
import { useEntryRefusals } from '@renderer/hooks/useEntryRefusals';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  getUpdateEntrySchemaFromFieldDefinitions,
  type SupportedLanguage,
  type UpdateEntryProps,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/$entryId/update'
)({
  component: UpdateEntryPage,
});

function UpdateEntryPage(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId, collectionId, entryId } = Route.useParams();
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    userQuery: { data: user },
    translateContent,
  } = useProject();
  const { data: collection, isPending: isReadingCollection } = useQueryNoError(
    queryOptions.collections.read({
      projectId,
      id: collectionId,
    })
  );
  const { data: entry, isPending: isReadingEntry } = useQueryNoError(
    queryOptions.entries.read({
      projectId,
      collectionId,
      id: entryId,
    })
  );
  // A dynamic field's Values are checked against the field definitions of the
  // Components it embeds, so the schema needs Core's resolver for them.
  const { componentResolver, isReadingComponents } =
    useComponentResolver(projectId);
  const generatedUpdateEntrySchema =
    collection && project && isReadingComponents === false
      ? getUpdateEntrySchemaFromFieldDefinitions(
          flattenFieldDefinitions(collection.fieldDefinitions),
          project.settings.language.supported,
          componentResolver
        )
      : getUpdateEntrySchemaFromFieldDefinitions([], []);

  const formId = useId();
  const isReadingEntryForm =
    isReadingEntry || isReadingCollection || isReadingProject;
  // A default Value for any field the Collection has gained since the Entry was
  // created, so the form always holds a complete Value per current field
  // definition. The Entry's own Values take precedence.
  const storedValues = isReadingEntryForm
    ? {}
    : {
        ...defaultEntryValues(
          flattenFieldDefinitions(collection.fieldDefinitions),
          project.settings.language.supported
        ),
        ...entry.values,
      };
  const updateEntryForm = useAppForm({
    resolver: zodResolver(generatedUpdateEntrySchema),
    defaultValues: {
      id: entryId,
      values: {},
    },
    // Filled from the queries rather than reset in an effect, so a refetch
    // while somebody is typing keeps what they typed.
    ...(isReadingEntryForm
      ? {}
      : {
          values: {
            ...entry,
            projectId,
            collectionId,
            values: storedValues,
          },
        }),
    disabled: isReadingEntry,
  });

  // Each refusal Core answers a save with lands on its own field, in its
  // section and its language. See contributing/error-handling.md.
  const refusals = useEntryRefusals(updateEntryForm);
  const {
    mutateAsync: updateEntry,
    isPending: isUpdatingEntry,
    handleError: handleRefusal,
  } = useAppMutation(queryOptions.entries.update, { handled: refusals });

  const onUpdateEntry: SubmitHandler<UpdateEntryProps> = async (entry) => {
    try {
      await updateEntry(entry);
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

  // The Entry by the one name Desktop gives it, which is what its row, its
  // crumb and every picker say, so the question before leaving names the page
  // the way the person found it.
  const title =
    isReadingEntryForm || user === null || user === undefined
      ? ''
      : entryTitle({
          entry,
          fieldDefinitions: flattenFieldDefinitions(
            collection.fieldDefinitions
          ),
          language: user.language,
        });

  // What keeps this Entry from being saved, in the words below Save. Core
  // refuses it until every language of the Project holds each required Value,
  // so the line names the first language that misses one and how many.
  const editedValues = useWatch({
    control: updateEntryForm.control,
    name: 'values',
  });
  const missingByLanguage = isReadingEntryForm
    ? new Map<SupportedLanguage, number>()
    : missingRequiredValues({
        values: editedValues,
        fieldDefinitions: flattenFieldDefinitions(collection.fieldDefinitions),
        supportedLanguages: project.settings.language.supported,
        defaultLanguage: project.settings.language.default,
      });
  // The first language that misses one, since the person opens one language at
  // a time. The sentence names it by its word in the language the app is read
  // in, as ci writes it, rather than by the code the switch above the fields
  // carries.
  const [missingLanguage, missingValues] = [
    ...missingByLanguage.entries(),
  ].find(([, count]) => count > 0) ?? [undefined, 0];
  const language =
    missingLanguage === undefined ? undefined : languageName(missingLanguage);
  const blockedBy =
    language === undefined
      ? undefined
      : t`${language} is missing ${plural(missingValues, { one: '# Value', other: '# Values' })}`;

  function Description(): ReactElement {
    return <Trans>Here you can edit this Entries Values</Trans>;
  }

  // The Collection's name in singular, or the domain term while the Collection
  // is still loading, so the sentence below takes one placeholder.
  const entryName = collection
    ? translateContent({
        key: 'collection.name.singular',
        record: collection.name.singular,
      })
    : t`Entry`;

  function Actions(): ReactElement {
    return (
      <FormActions form={updateEntryForm} id={formId} blockedBy={blockedBy}>
        <SubmitButton requireDirty Icon={Check}>
          <Trans>Update {entryName}</Trans>
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
          entryForm={updateEntryForm}
          fieldDefinitions={collection.fieldDefinitions}
          project={project}
          isViewOnly={isUpdatingEntry}
          onFormSubmit={onUpdateEntry}
          blockedBy={blockedBy}
          unsavedChangesTitle={title}
        />
      </Page>
    </>
  );
}
