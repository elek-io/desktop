import { zodResolver } from '@hookform/resolvers/zod';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import React, { useId, useMemo } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { defaultEntryValues } from '@renderer/components/fields';
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
import { useMissingValues } from '@renderer/hooks/useMissingValues';
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
  // The Collection's fields, a section's own included, as one list. Kept rather
  // than flattened per render, because what counts the missing Values is read
  // against it and takes its count again whenever it changes.
  const fieldDefinitions = useMemo(
    () =>
      collection === undefined
        ? []
        : flattenFieldDefinitions(collection.fieldDefinitions),
    [collection]
  );
  // The Project's languages, or nothing while the Project is still being read.
  const languages = isReadingProject ? undefined : project.settings.language;
  const generatedCreateEntrySchema =
    languages !== undefined &&
    isReadingCollection === false &&
    isReadingComponents === false
      ? getCreateEntrySchemaFromFieldDefinitions(
          fieldDefinitions,
          languages.supported,
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
              fieldDefinitions,
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
  const supportedLanguages = languages?.supported ?? [];
  const missingByLanguage = useMissingValues({
    form: createEntryForm,
    name: 'values',
    fieldDefinitions,
    // Nothing is counted while the form is still filling, the same as above.
    languages: isReadingCollection ? undefined : languages,
    // A section's own required Values count too, which needs the field
    // definitions of the Component each section is built from.
    ...(isReadingComponents
      ? {}
      : { componentFieldDefinitions: componentResolver }),
  });
  const [missingLanguage, missingValues] = [
    ...missingByLanguage.entries(),
  ].find(([, count]) => count > 0) ?? [undefined, 0];
  const language =
    missingLanguage === undefined ? undefined : languageName(missingLanguage);
  const blockedBy =
    language === undefined
      ? undefined
      : t`${language} is missing ${plural(missingValues, { one: '# Value', other: '# Values' })}`;

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
          <Trans>Create a new {entryName}</Trans>
        </h1>
        <FormActions form={createEntryForm} id={formId} blockedBy={blockedBy}>
          <SubmitButton requireDirty Icon={Check}>
            <Trans>Create {entryName}</Trans>
          </SubmitButton>
        </FormActions>
      </PaneHead>
      {/* The switch stands below the title and above the fields, which is
      where ci draws it. A Project of one language has nothing to switch
      between, so it carries no row. */}
      {supportedLanguages.length > 1 ? (
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
      ) : null}
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
