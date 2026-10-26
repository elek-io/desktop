import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check, Trash } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { ComponentImpact } from '@renderer/components/component-impact';
import { ComponentForm } from '@renderer/components/forms/component-form';
import { Page } from '@renderer/components/page';
import { PageSection } from '@renderer/components/page-section';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@renderer/components/ui/alert-dialog';
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
import { withEmptyDescriptionAsNull } from '@renderer/lib/resolver';
import {
  describeEntryIssue,
  entryIssuesOf,
  type SchemaChangeIssue,
} from '@renderer/lib/schemaChange';
import { queryOptions } from '@renderer/queries';

import {
  getUpdateComponentSchemaFromLanguages,
  type CoreErrorType,
  type UpdateComponentProps,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/components/$componentId'
)({
  component: ProjectComponentUpdate,
});

// Copy for a blocked delete, keyed by CoreError type.
const deleteErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'A Collection or another Component still uses this Component, so it cannot be deleted. Take it out of the Fields that allow it first, then try again.',
};

const deleteErrorFallback =
  'This Component could not be deleted. Please review and try again.';

// Copy for a blocked save, keyed by CoreError type. A slug another Component
// holds is said below the Slug field instead, and the Entries a Field change
// cannot reach on its own are listed under this description, so what is left
// here is a Conflict with neither, and the circular reference BadRequest.
const saveErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'Nothing was saved, and this Component is exactly as it was. Your Field changes reach Entries that already exist, and each one has to be answered before the change can go in, which elek.io Desktop cannot do yet. Put the Field changes back for now.',
  BadRequest:
    'A Component cannot use itself, not directly and not through another Component. Change which Components its dynamic Field allows and try again.',
};

const saveErrorFallback =
  'This Component could not be saved. Please review your changes and try again.';

function ProjectComponentUpdate(): ReactElement {
  const router = useRouter();
  const { projectId, componentId } = Route.useParams();
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    translateContent,
  } = useProject();
  const { data: component, isPending: isReadingComponent } = useQueryNoError(
    queryOptions.components.read({ projectId, id: componentId })
  );
  const { data: collectionList, isPending: isReadingCollections } =
    useQueryNoError(queryOptions.collections.list({ projectId, limit: 0 }));
  useBreadcrumb(
    Route,
    isReadingComponent
      ? undefined
      : translateContent({ key: 'component.name', record: component.name })
  );
  const formId = useId();
  const [isSaveErrorDialogOpen, setIsSaveErrorDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [isDeleteErrorDialogOpen, setIsDeleteErrorDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  // Resolve against Core's language-aware schema, which requires a value for
  // every Project language. A Component written before a language was added to
  // the Project is missing that language, and Core's strict validator flags it
  // on the field itself.
  const generatedUpdateComponentSchema =
    isReadingProject === false
      ? getUpdateComponentSchemaFromLanguages(
          project.settings.language.supported
        )
      : getUpdateComponentSchemaFromLanguages([]);

  const updateComponentForm = useForm({
    resolver: withEmptyDescriptionAsNull(
      zodResolver(generatedUpdateComponentSchema)
    ),
    // Seed every bound value so each control is controlled from the first
    // render, before the Component loads and reset() hydrates it.
    defaultValues: {
      projectId,
      id: componentId,
      name: {},
      slug: '',
      description: {},
      fieldDefinitions: [],
    },
  });

  // Core raises Conflict on this path for two unrelated reasons, and the cause
  // it attaches is what tells them apart: a Field change it cannot carry out
  // alone comes with the list of Entries to fix, a slug another Component holds
  // comes with nothing. See contributing/error-handling.md.
  const {
    mutateAsync: updateComponent,
    isPending: isUpdatingComponent,
    handleError: handleSaveError,
  } = useAppMutation(queryOptions.components.update, {
    handled: {
      Conflict: (error) => {
        if (entryIssuesOf(error).length === 0) {
          updateComponentForm.setError('slug', {
            type: 'conflict',
            message:
              'Another Component in this Project already uses this slug. Choose another one.',
          });
          return;
        }
        setSaveError(error);
        setIsSaveErrorDialogOpen(true);
      },
      BadRequest: (error) => {
        setSaveError(error);
        setIsSaveErrorDialogOpen(true);
      },
    },
  });

  // A Component a Collection or another Component still uses is handled in
  // place. See contributing/error-handling.md.
  const { mutateAsync: deleteComponent, handleError: handleDeleteError } =
    useAppMutation(queryOptions.components.delete, {
      handled: {
        Conflict: (error) => {
          setDeleteError(error);
          setIsDeleteErrorDialogOpen(true);
        },
      },
    });

  // Reset the form with the Component when it loads. The stored field
  // definitions go back as they are, ids included, which is what keeps the
  // content of every Entry holding this Component: Core matches field
  // definitions by id, so a new id would read as a removal plus an addition.
  useEffect(() => {
    if (isReadingComponent === false) {
      updateComponentForm.reset({ ...component, projectId });
    }
  }, [projectId, isReadingComponent, component, updateComponentForm]);

  const name = isReadingComponent
    ? 'Component'
    : translateContent({ key: 'component.name', record: component.name });

  function Description(): ReactElement {
    return (
      <>
        A Component is a group of fields an Entry can hold more than once, in
        any order. Its fields cannot be unique, and it holds no slug field.
      </>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={updateComponentForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          Save changes
        </SubmitButton>
      </FormActions>
    );
  }

  const onUpdate: SubmitHandler<UpdateComponentProps> = async (props) => {
    try {
      await updateComponent(props);
    } catch (error) {
      // A taken slug, a Field change reaching existing Entries and a circular
      // reference are surfaced in place above. Any other failure was already
      // routed to the boundary, so this is a no-op.
      handleSaveError(error);
      return;
    }
    await router.navigate({
      to: '/projects/$projectId/components',
      params: { projectId },
    });
  };

  const onDelete = async (): Promise<void> => {
    try {
      await deleteComponent({ projectId, id: componentId });
      await router.navigate({
        to: '/projects/$projectId/components',
        params: { projectId },
      });
    } catch (error) {
      handleDeleteError(error);
    }
  };

  const { type: saveErrorType } = parseIpcError(saveError);
  const { type: deleteErrorType } = parseIpcError(deleteError);
  const saveErrorIssues = entryIssuesOf(saveError);

  /** The Collection an issue sits in, by the name somebody gave it. */
  function collectionName(issue: SchemaChangeIssue): string {
    const collection = isReadingCollections
      ? undefined
      : collectionList.list.find(
          (candidate) => candidate.id === issue.collectionId
        );
    if (collection === undefined) {
      return 'A Collection';
    }
    return translateContent({
      key: 'collection.name.plural',
      record: collection.name.plural,
    });
  }

  if (isReadingProject) {
    return <></>;
  }

  return (
    <Page title={name} description={<Description />} actions={<Actions />}>
      <ComponentForm
        id={formId}
        componentForm={updateComponentForm}
        project={project}
        isViewOnly={isUpdatingComponent}
        onFormSubmit={onUpdate}
      >
        <ComponentImpact componentId={componentId} />

        <PageSection title="Danger Zone">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm leading-6 font-medium">
                Delete this Component
              </p>
            </div>
            <div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" Icon={Trash}>
                    Delete Component
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this Component?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A Component a Collection or another Component still uses
                      cannot be deleted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        variant="destructive"
                        Icon={Trash}
                        onClick={onDelete}
                      >
                        Yes, delete this Component
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog
                open={isDeleteErrorDialogOpen}
                onOpenChange={setIsDeleteErrorDialogOpen}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Could not delete this Component</DialogTitle>
                    <DialogDescription>
                      {describeCoreError(
                        deleteErrorType,
                        deleteErrorDescriptions,
                        deleteErrorFallback
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
            </div>
          </div>
        </PageSection>
      </ComponentForm>

      <Dialog
        open={isSaveErrorDialogOpen}
        onOpenChange={setIsSaveErrorDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Could not save this Component</DialogTitle>
            <DialogDescription>
              {describeCoreError(
                saveErrorType,
                saveErrorDescriptions,
                saveErrorFallback
              )}
            </DialogDescription>
          </DialogHeader>
          {/* Core puts the Entries it could not carry the change into in the
          error's cause, so each one is named here rather than leaving the
          editor to guess which Entry to open. See shared/ipcError.ts. */}
          {saveErrorIssues.length > 0 ? (
            <ul className="list-inside list-disc text-sm">
              {saveErrorIssues.map((issue) => (
                <li key={`${issue.entryId}-${issue.fieldSlug}-${issue.issue}`}>
                  {collectionName(issue)}, Entry {issue.entryId}, Field{' '}
                  {issue.fieldSlug}: {describeEntryIssue(issue.issue)}
                </li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
