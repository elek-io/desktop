import { zodResolver } from '@hookform/resolvers/zod';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { Check, History } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { useWatch, type SubmitHandler } from 'react-hook-form';

import { EntryHistoryPane } from '@renderer/components/entry-history';
import { defaultEntryValues } from '@renderer/components/fields';
import { entryTitle } from '@renderer/components/fields/entry-title';
import { missingRequiredValues } from '@renderer/components/fields/missing-values';
import { EntryForm } from '@renderer/components/forms/entry-form';
import { LanguageSwitch } from '@renderer/components/language-switch';
import { Pane, PaneHead } from '@renderer/components/pane';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
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
  flattenFieldDefinitions,
  getUpdateEntrySchemaFromFieldDefinitions,
  type SupportedLanguage,
  type UpdateEntryProps,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/$entryId/update'
)({
  component: UpdateEntryPage,
  validateSearch: entryLanguageSearchSchema,
});

function UpdateEntryPage(): ReactElement {
  const { t } = useLingui();

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
  // The Entry's own changes, read beside the Entry rather than before it, so
  // the form draws without waiting for a read of the Project's git history.
  const { data: changes, isPending: isReadingChanges } = useQueryNoError(
    queryOptions.entries.history({ projectId, collectionId, id: entryId })
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
  const supportedLanguages = isReadingProject
    ? []
    : project.settings.language.supported;
  const missingByLanguage = isReadingEntryForm
    ? new Map<SupportedLanguage, number>()
    : missingRequiredValues({
        values: editedValues,
        fieldDefinitions: flattenFieldDefinitions(collection.fieldDefinitions),
        supportedLanguages,
        defaultLanguage: project.settings.language.default,
        // A section's own required Values count too, which needs the field
        // definitions of the Component each section is built from.
        ...(isReadingComponents
          ? {}
          : { componentFieldDefinitions: componentResolver }),
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

  // The language the whole Entry is edited in, which stays in the address, so
  // coming back to this Entry opens the language that was left open.
  const navigate = Route.useNavigate();
  const shownLanguage = entryLanguage({
    search: Route.useSearch(),
    supportedLanguages,
    defaultLanguage: isReadingProject
      ? undefined
      : project.settings.language.default,
  });
  const setLanguage = (next: SupportedLanguage): void => {
    // It replaces rather than pushes, so the way back leads out of the Entry
    // rather than through every language that was looked at, and the editor
    // stays where it was scrolled to.
    void navigate({
      search: (previous) => ({ ...previous, language: next }),
      replace: true,
      resetScroll: false,
    });
  };
  const refused = languagesWithErrors(
    updateEntryForm.formState.errors,
    supportedLanguages
  );
  // The History pane is open until it is closed, which ci draws as the state
  // it opens in. It is a state of this screen rather than of the address,
  // because it says nothing about which Entry is open.
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);

  // The Collection's name in singular, or the domain term while the Collection
  // is still loading, so the sentence below takes one placeholder.
  const entryName = collection
    ? translateContent({
        key: 'collection.name.singular',
        record: collection.name.singular,
      })
    : t`Entry`;

  if (isReadingProject || isReadingCollection || isReadingComponents) {
    return <></>;
  }

  return (
    <>
      <Pane name={t`this Entry`}>
        <PaneHead className="pb-1.5">
          <h1 className="min-w-0 flex-1 truncate text-h3">{title}</h1>
          {isHistoryOpen ? null : (
            <Button
              variant="ghost"
              size="icon"
              Icon={History}
              aria-label={t`Show the History of this Entry`}
              onClick={() => setIsHistoryOpen(true)}
            />
          )}
          <FormActions form={updateEntryForm} id={formId} blockedBy={blockedBy}>
            <SubmitButton requireDirty Icon={Check}>
              <Trans>Update {entryName}</Trans>
            </SubmitButton>
          </FormActions>
        </PaneHead>
        {/* The switch stands below the title and above the fields, which is
        where ci draws it, so it is the first thing in the editor. */}
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
            entryForm={updateEntryForm}
            fieldDefinitions={collection.fieldDefinitions}
            project={project}
            language={shownLanguage}
            isViewOnly={isUpdatingEntry}
            onFormSubmit={onUpdateEntry}
            blockedBy={blockedBy}
            unsavedChangesTitle={title}
          />
        </ScrollArea>
      </Pane>
      {isHistoryOpen ? (
        <Pane width="list" name={t`the History of this Entry`}>
          <EntryHistoryPane
            changes={isReadingChanges ? undefined : changes}
            onClose={() => setIsHistoryOpen(false)}
          />
        </Pane>
      ) : null}
    </>
  );
}
