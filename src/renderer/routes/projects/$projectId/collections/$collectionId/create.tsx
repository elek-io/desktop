import { zodResolver } from '@hookform/resolvers/zod';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import React, { useId } from 'react';
import { useWatch, type SubmitHandler } from 'react-hook-form';

import { defaultEntryValues } from '@renderer/components/fields';
import { missingRequiredValues } from '@renderer/components/fields/missing-values';
import { EntryForm } from '@renderer/components/forms/entry-form';
import { LanguageSwitch } from '@renderer/components/language-switch';
import { Pane, PaneHead } from '@renderer/components/pane';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useComponentResolver } from '@renderer/hooks/useComponentResolver';
import { useEntryRefusals } from '@renderer/hooks/useEntryRefusals';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import {
  entryLanguage,
  entryLanguageSearchSchema,
} from '@renderer/lib/entryLanguage';
import { languagesWithErrors } from '@renderer/lib/formErrors';
import { languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  type CreateEntryProps,
  flattenFieldDefinitions,
  getCreateEntrySchemaFromFieldDefinitions,
  type SupportedLanguage,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/create'
)({
  component: CreateEntryPage,
  validateSearch: entryLanguageSearchSchema,
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

  // What keeps this Entry from being created, in the words below Save. Core
  // refuses it until every language of the Project holds each required Value,
  // the same as for an Entry that already exists.
  const editedValues = useWatch({
    control: createEntryForm.control,
    name: 'values',
  });
  const supportedLanguages = isReadingProject
    ? []
    : project.settings.language.supported;
  const missingByLanguage =
    isReadingProject || isReadingCollection
      ? new Map<SupportedLanguage, number>()
      : missingRequiredValues({
          values: editedValues,
          fieldDefinitions: flattenFieldDefinitions(
            collection.fieldDefinitions
          ),
          supportedLanguages,
          defaultLanguage: project.settings.language.default,
          ...(isReadingComponents
            ? {}
            : { componentFieldDefinitions: componentResolver }),
        });
  const [missingLanguage, missingValues] = [
    ...missingByLanguage.entries(),
  ].find(([, count]) => count > 0) ?? [undefined, 0];
  const missingLanguageName =
    missingLanguage === undefined ? undefined : languageName(missingLanguage);
  const blockedBy =
    missingLanguageName === undefined
      ? undefined
      : t`${missingLanguageName} is missing ${plural(missingValues, { one: '# Value', other: '# Values' })}`;

  // The language the whole Entry is written in, which stays in the address, so
  // the language a new Entry was started in survives a reload.
  const navigate = Route.useNavigate();
  const shownLanguage = entryLanguage({
    search: Route.useSearch(),
    supportedLanguages,
    defaultLanguage: isReadingProject
      ? undefined
      : project.settings.language.default,
  });
  const setLanguage = (next: SupportedLanguage): void => {
    void navigate({
      search: (previous) => ({ ...previous, language: next }),
      replace: true,
      resetScroll: false,
    });
  };
  const refused = languagesWithErrors(
    createEntryForm.formState.errors,
    supportedLanguages
  );

  // The Collection's name in singular, or the domain term while the Collection
  // is still loading, so each sentence below takes one placeholder rather than
  // being assembled around it.
  const entryName = collection
    ? translateContent({
        key: 'currentCollection.name',
        record: collection.name.singular,
      })
    : t`Entry`;

  if (isReadingProject || isReadingCollection || isReadingComponents) {
    return <></>;
  }

  return (
    <Pane name={t`a new Entry`}>
      <PaneHead className="pb-1.5">
        <h1 className="min-w-0 flex-1 truncate text-h3">
          <Trans>Create {entryName}</Trans>
        </h1>
        <FormActions form={createEntryForm} id={formId} blockedBy={blockedBy}>
          <SubmitButton requireDirty Icon={Check}>
            <Trans>Create {entryName}</Trans>
          </SubmitButton>
        </FormActions>
      </PaneHead>
      <div className="flex items-center gap-3 px-(--pane-edge) pb-4">
        <LanguageSwitch
          languages={supportedLanguages.map((candidate) => ({
            language: candidate,
            missing: missingByLanguage.get(candidate) ?? 0,
            hasError: refused.has(candidate),
          }))}
          language={shownLanguage}
          onLanguageChange={setLanguage}
        />
      </div>
      <ScrollArea className="flex-1">
        <EntryForm
          id={formId}
          entryForm={createEntryForm}
          fieldDefinitions={collection.fieldDefinitions}
          project={project}
          language={shownLanguage}
          isViewOnly={isCreatingEntry}
          onFormSubmit={onCreateEntry}
          blockedBy={blockedBy}
        />
      </ScrollArea>
    </Pane>
  );
}
