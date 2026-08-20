import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check, Trash } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { CollectionForm } from '@renderer/components/forms/collection-form';
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
import { queryOptions } from '@renderer/queries';

import {
  type CoreErrorType,
  type DeleteCollectionProps,
  type UpdateCollectionProps,
  getUpdateCollectionSchemaFromLanguages,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/update'
)({
  component: ProjectCollectionUpdate,
});

// Copy for a blocked delete, keyed by CoreError type.
const deleteErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'Entries in other Collections still reference Entries in this one, so it can’t be deleted. Remove or repoint those references first, then try again.',
};

const deleteErrorFallback =
  'This Collection could not be deleted. Please review and try again.';

// Copy for a blocked save, keyed by CoreError type.
//
// Core throws Conflict from two unrelated places on this path: a slug already
// taken by another Collection (CollectionService.assertCollectionSlugIsAvailable)
// and Field changes that need per-Entry resolutions before they can be applied.
// The structured `cause` that tells them apart is dropped at the IPC boundary
// (see shared/ipcError.ts), so this copy has to cover both rather than assert
// the wrong one. Narrow it once `cause` is forwarded and `handled` can
// discriminate below `type`.
const saveErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'Saving was blocked, for one of two reasons. Either another Collection in this Project already uses one of these slugs, or your Field changes affect Entries that already exist and have to be resolved first. Resolving Entries is not supported in the app yet, so if the slugs are free, revert the Field changes for now.',
};

const saveErrorFallback =
  'This Collection could not be saved. Please review your changes and try again.';

function ProjectCollectionUpdate(): ReactElement {
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
  useBreadcrumb(Route, isReadingCollection ? undefined : 'Configure');
  const formId = useId();
  const [isSaveErrorDialogOpen, setIsSaveErrorDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  // A slug already taken by another Collection is handled in place.
  // See contributing/error-handling.md.
  const {
    mutateAsync: updateCollection,
    isPending: isUpdatingCollection,
    handleError: handleSaveError,
  } = useAppMutation(queryOptions.collections.update, {
    handled: {
      Conflict: (error) => {
        setSaveError(error);
        setIsSaveErrorDialogOpen(true);
      },
    },
  });
  const [isDeleteErrorDialogOpen, setIsDeleteErrorDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  // A Collection still referenced by an Entry is handled in place.
  // See contributing/error-handling.md.
  const { mutateAsync: deleteCollection, handleError: handleDeleteError } =
    useAppMutation(queryOptions.collections.delete, {
      handled: {
        Conflict: (error) => {
          setDeleteError(error);
          setIsDeleteErrorDialogOpen(true);
        },
      },
    });
  // Resolve against Core's language-aware schema, which requires a value for
  // every Project language. A Collection written before a language was added to
  // the Project is missing that language, and Core's strict validator flags it
  // on the field itself. Falls back to an empty language set until the Project
  // loads, matching the Entry routes.
  const generatedUpdateCollectionSchema =
    isReadingProject === false
      ? getUpdateCollectionSchemaFromLanguages(
          project.settings.language.supported
        )
      : getUpdateCollectionSchemaFromLanguages([]);

  const updateCollectionForm = useForm({
    resolver: zodResolver(generatedUpdateCollectionSchema),
    // Seed every bound value so each control is controlled from the first
    // render, before the Collection loads and reset() hydrates it. A partial
    // seed here lets the icon Select mount uncontrolled and flip to controlled
    // on reset, which React warns about and which dirties the form.
    defaultValues: {
      projectId,
      icon: 'home',
      name: {
        singular: {},
        plural: {},
      },
      description: {},
      slug: {
        singular: '',
        plural: '',
      },
      fieldDefinitions: [],
    },
  });

  // Reset form with Collection data when it loads. The stored records are used
  // as-is: Core's language-aware resolver above is the single validator, so any
  // language a Collection is missing surfaces on its own field rather than
  // needing a client-side re-seed.
  useEffect(() => {
    if (isReadingCollection === false) {
      updateCollectionForm.reset({
        ...collection,
        projectId,
      });
    }
  }, [projectId, isReadingCollection, collection, updateCollectionForm]);

  const title = `Configure ${
    isReadingCollection === false
      ? translateContent({
          key: 'collection.name.plural',
          record: collection.name.plural,
        })
      : 'Collection'
  }`;

  function Description(): ReactElement {
    return (
      <>
        A Collection holds information about how your content is structured.
        <br />
        Read more about <a href="#">Collections in the documentation</a>.
      </>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={updateCollectionForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          Save changes
        </SubmitButton>
      </FormActions>
    );
  }

  const onUpdate: SubmitHandler<UpdateCollectionProps> = async (collection) => {
    try {
      await updateCollection(collection);
    } catch (error) {
      // A slug collision is surfaced in place by the dialog below. Any other
      // failure was already routed to the boundary, so this is a no-op.
      handleSaveError(error);
      return;
    }
    await router.navigate({
      to: '/projects/$projectId/collections/$collectionId',
      params: {
        projectId,
        collectionId,
      },
    });
  };

  const onDelete: SubmitHandler<DeleteCollectionProps> = async (collection) => {
    try {
      await deleteCollection({
        projectId,
        id: collection.id,
      });
      await router.navigate({
        to: '/projects/$projectId/collections',
        params: {
          projectId,
        },
      });
    } catch (error) {
      handleDeleteError(error);
    }
  };

  const { type: deleteErrorType } = parseIpcError(deleteError);
  const { type: saveErrorType } = parseIpcError(saveError);

  if (isReadingProject) {
    return <></>;
  }

  return (
    <Page title={title} description={<Description />} actions={<Actions />}>
      <CollectionForm
        id={formId}
        collectionForm={updateCollectionForm}
        project={project}
        isViewOnly={isUpdatingCollection}
        onFormSubmit={onUpdate}
      >
        <PageSection title="Danger Zone">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm leading-6 font-medium">
                Delete this Collection
              </p>
            </div>
            <div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash className="mr-2 h-4 w-4" />
                    Delete Collection
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this Collection?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deleting this Collection also permanently deletes every
                      Entry inside it. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          onDelete({
                            projectId,
                            id: collectionId,
                          })
                        }
                      >
                        <Trash className="mr-2 h-4 w-4" />
                        Yes, delete this Collection
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
                    <DialogTitle>Could not delete this Collection</DialogTitle>
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
      </CollectionForm>

      <Dialog
        open={isSaveErrorDialogOpen}
        onOpenChange={setIsSaveErrorDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Could not save this Collection</DialogTitle>
            <DialogDescription>
              {describeCoreError(
                saveErrorType,
                saveErrorDescriptions,
                saveErrorFallback
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
    </Page>
  );
}
