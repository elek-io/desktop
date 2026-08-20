import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import React, { useEffect, useId, useState, type ReactElement } from 'react';
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
import { defaultEntryValues } from '@renderer/lib/entry';
import { queryOptions } from '@renderer/queries';

import {
  type CoreErrorType,
  type CreateEntryProps,
  flattenFieldDefinitions,
  getCreateEntrySchemaFromFieldDefinitions,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/create'
)({
  component: CreateEntryPage,
});

// Copy for a blocked create, keyed by CoreError type.
const conflictDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'One of the values you entered must be unique, but another Entry in this Collection already uses it. Change it and try again.',
};

const conflictFallback =
  'This Entry could not be saved. Please review your values and try again.';

function CreateEntryPage(): React.JSX.Element {
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
  useBreadcrumb(Route, isReadingCollection ? undefined : 'Create');
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [conflictError, setConflictError] = useState<unknown>(null);
  // A unique-value collision is handled in place on this form.
  // See contributing/error-handling.md.
  const {
    mutateAsync: createEntry,
    isPending: isCreatingEntry,
    handleError: handleConflict,
  } = useAppMutation(queryOptions.entries.create, {
    handled: {
      Conflict: (error) => {
        setConflictError(error);
        setIsConflictDialogOpen(true);
      },
    },
  });
  const generatedCreateEntrySchema =
    isReadingProject === false && isReadingCollection === false
      ? getCreateEntrySchemaFromFieldDefinitions(
          flattenFieldDefinitions(collection.fieldDefinitions),
          project.settings.language.supported
        )
      : getCreateEntrySchemaFromFieldDefinitions([], []);
  const formId = useId();
  const createEntryForm = useForm({
    resolver: zodResolver(generatedCreateEntrySchema),
    defaultValues: {
      projectId: projectId,
      collectionId: collectionId,
      values: {},
    },
  });

  // Reset form with Project and Collection data when it loads
  useEffect(() => {
    if (isReadingProject === false && isReadingCollection === false) {
      createEntryForm.reset({
        projectId: projectId,
        collectionId: collectionId,
        values: defaultEntryValues(
          flattenFieldDefinitions(collection.fieldDefinitions),
          project.settings.language.supported
        ),
      });
    }
  }, [
    projectId,
    collectionId,
    project,
    collection,
    isReadingProject,
    isReadingCollection,
    createEntryForm,
  ]);

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
      // A unique-value collision is surfaced in place by the dialog below. Any
      // other failure was already routed to the boundary, so this is a no-op.
      handleConflict(error);
    }
  };

  const title = `Create a new ${
    collection
      ? translateContent({
          key: 'currentCollection.name',
          record: collection.name.singular,
        })
      : 'Entry'
  }`;

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
          Create{' '}
          {collection
            ? translateContent({
                key: 'currentCollection.name.singular',
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
          entryForm={createEntryForm}
          fieldDefinitions={collection.fieldDefinitions}
          project={project}
          isViewOnly={isCreatingEntry}
          onFormSubmit={onCreateEntry}
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
