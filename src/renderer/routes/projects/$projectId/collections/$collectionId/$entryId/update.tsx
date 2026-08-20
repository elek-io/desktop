import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { EntryForm } from '@renderer/components/forms/entry-form';
import { Page } from '@renderer/components/page';
import { FormActions, SubmitButton } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { defaultEntryValue } from '@renderer/lib/entry';
import { queryOptions } from '@renderer/queries';

import {
  type CoreErrorType,
  flattenFieldDefinitions,
  getUpdateEntrySchemaFromFieldDefinitions,
  type UpdateEntryProps,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/$entryId/update'
)({
  component: UpdateEntryPage,
});

// Copy for a blocked update, keyed by CoreError type.
const conflictDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'One of the values you entered must be unique, but another Entry in this Collection already uses it. Change it and try again.',
};

const conflictFallback =
  'This Entry could not be saved. Please review your values and try again.';

function UpdateEntryPage(): ReactElement {
  const router = useRouter();
  const { projectId, collectionId, entryId } = Route.useParams();
  useBreadcrumb(Route, 'Update');
  const {
    projectQuery: { data: project, isPending: isReadingProject },
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
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflictError, setConflictError] = useState<unknown>(null);
  // A unique-value collision is handled in place on this form.
  // See contributing/error-handling.md.
  const {
    mutateAsync: updateEntry,
    isPending: isUpdatingEntry,
    handleError: handleConflict,
  } = useAppMutation(queryOptions.entries.update, {
    handled: {
      Conflict: (error) => {
        setConflictError(error);
        setIsConflictDialogOpen(true);
      },
    },
  });
  const generatedUpdateEntrySchema =
    collection && project
      ? getUpdateEntrySchemaFromFieldDefinitions(
          flattenFieldDefinitions(collection.fieldDefinitions),
          project.settings.language.supported
        )
      : getUpdateEntrySchemaFromFieldDefinitions([], []);

  const formId = useId();
  const updateEntryForm = useForm({
    resolver: zodResolver(generatedUpdateEntrySchema),
    defaultValues: {
      id: entryId,
      values: {},
    },
  });

  // Reset form with Project and Collection data when it loads
  useEffect(() => {
    if (
      isReadingEntry === false &&
      isReadingCollection === false &&
      isReadingProject === false
    ) {
      // Hydrate a default Value for any field the Collection has gained since the
      // Entry was created, so the form always holds a complete Value per current
      // field definition. The Entry's own Values take precedence.
      const values: Record<string, unknown> = { ...entry.values };
      for (const definition of flattenFieldDefinitions(
        collection.fieldDefinitions
      )) {
        if (!(definition.slug in values)) {
          values[definition.slug] = defaultEntryValue(
            definition,
            project.settings.language.supported
          );
        }
      }
      updateEntryForm.reset({
        ...entry,
        projectId,
        collectionId,
        values,
      });
    }
  }, [
    collectionId,
    projectId,
    entry,
    collection,
    project,
    isReadingEntry,
    isReadingCollection,
    isReadingProject,
    updateEntryForm,
  ]);

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
      // A unique-value collision is surfaced in place by the dialog below. Any
      // other failure was already routed to the boundary, so this is a no-op.
      handleConflict(error);
    }
  };

  // @todo Should map to a Value defined by the user (which could also be used in the Collection index page and breadcrumb to always show a "title" of the Entry)
  // context.translate(
  //   'currentCollection.name.plural',
  //   context.currentEntry.values[0].content
  // );
  const title = entry ? entry.id : '';

  function Description(): ReactElement {
    return <>Here you can edit this Entries Values</>;
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={updateEntryForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          Update{' '}
          {collection
            ? translateContent({
                key: 'collection.name.singular',
                record: collection.name.singular,
              })
            : 'Entry'}
        </SubmitButton>
      </FormActions>
    );
  }

  if (isReadingProject || isReadingCollection) {
    return <></>;
  }

  const { type: conflictErrorType } = parseIpcError(conflictError);

  return (
    <>
      <Page title={title} description={<Description />} actions={<Actions />}>
        <EntryForm
          id={formId}
          entryForm={updateEntryForm}
          fieldDefinitions={collection.fieldDefinitions}
          project={project}
          isViewOnly={isReadingEntry || isUpdatingEntry}
          onFormSubmit={onUpdateEntry}
        />
      </Page>

      <Dialog
        open={isConflictDialogOpen}
        onOpenChange={setIsConflictDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Could not save this Entry</DialogTitle>
            <DialogDescription>
              {describeCoreError(
                conflictErrorType,
                conflictDescriptions,
                conflictFallback
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
