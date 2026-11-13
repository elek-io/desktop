import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check, Trash } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';

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
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { DEFAULT_COLLECTION_ICON } from '@renderer/lib/collectionIcons';
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
const deleteErrorDescriptions: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  Conflict: msg`Entries in other Collections still reference Entries in this one, so it can’t be deleted. Remove or repoint those references first, then try again.`,
};

const deleteErrorFallback = msg`This Collection could not be deleted. Please review and try again.`;

// Copy for a blocked save, keyed by CoreError type.
//
// Core throws Conflict from unrelated places on this path: a slug already
// taken by another Collection (CollectionService.assertCollectionSlugIsAvailable),
// Field changes that need per-Entry resolutions before they can be applied, and
// a Field change that would delete stored Values, which Core refuses until the
// update accepts the loss (see contributing/not-yet-implemented.md). The
// structured `cause` that tells them apart is dropped at the IPC boundary (see
// shared/ipcError.ts), so this copy has to cover them all rather than assert the
// wrong one. Narrow it once `cause` is forwarded and `handled` can discriminate
// below `type`.
const saveErrorDescriptions: Partial<Record<CoreErrorType, MessageDescriptor>> =
  {
    Conflict: msg`Nothing was saved, and this Collection is exactly as it was. Either another Collection in this Project already uses one of these slugs, or your Field changes reach Entries that already exist. Taking out a Field an Entry has written in would delete what it holds, so that is refused. Other changes have to be resolved Entry by Entry, which elek.io Desktop cannot do yet. Change the slugs, or put the Field changes back for now.`,
  };

const saveErrorFallback = msg`This Collection could not be saved. Please review your changes and try again.`;

function ProjectCollectionUpdate(): ReactElement {
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
  useBreadcrumb(Route, isReadingCollection ? undefined : t`Configure`);
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

  const updateCollectionForm = useAppForm({
    resolver: zodResolver(generatedUpdateCollectionSchema),
    // Seed every bound value so each control is controlled from the first
    // render, before the Collection arrives. A partial seed here lets the icon
    // Select mount uncontrolled and flip to controlled, which React warns about
    // and which dirties the form.
    defaultValues: {
      projectId,
      icon: DEFAULT_COLLECTION_ICON,
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
    // Filled from the query rather than reset in an effect, so a refetch keeps
    // what is being typed. The stored records go in as they are: Core's
    // language-aware resolver above is the single validator, so any language a
    // Collection is missing surfaces on its own field rather than needing a
    // client-side re-seed.
    ...(isReadingCollection ? {} : { values: { ...collection, projectId } }),
    disabled: isReadingCollection,
  });

  // The Collection's name in plural, or the domain term while it is still
  // loading, so the title takes one placeholder rather than being assembled
  // around it.
  const collectionName =
    isReadingCollection === false
      ? translateContent({
          key: 'collection.name.plural',
          record: collection.name.plural,
        })
      : t`Collection`;
  const title = t`Configure ${collectionName}`;

  function Description(): ReactElement {
    return (
      <Trans>
        A Collection holds information about how your content is structured.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={updateCollectionForm} id={formId}>
        <SubmitButton requireDirty Icon={Check}>
          <Trans>Save changes</Trans>
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
      // The page takes this way out itself, so leaving it asks nothing:
      // the Collection and everything typed into its settings are gone.
      await router.navigate({
        to: '/projects/$projectId/collections',
        params: {
          projectId,
        },
        ignoreBlocker: true,
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
        schema={generatedUpdateCollectionSchema}
        id={formId}
        collectionForm={updateCollectionForm}
        project={project}
        isViewOnly={isUpdatingCollection}
        onFormSubmit={onUpdate}
        unsavedChangesTitle={title}
      >
        <PageSection title={t`Danger Zone`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm leading-6 font-medium">
                <Trans>Delete this Collection</Trans>
              </p>
            </div>
            <div>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" />}>
                  <Trash className="mr-2 h-4 w-4" />
                  <Trans>Delete Collection</Trans>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      <Trans>Delete this Collection?</Trans>
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      <Trans>
                        Deleting this Collection also permanently deletes every
                        Entry inside it. This cannot be undone.
                      </Trans>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      <Trans>Cancel</Trans>
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      Icon={Trash}
                      onClick={() =>
                        onDelete({
                          projectId,
                          id: collectionId,
                        })
                      }
                    >
                      <Trans>Yes, delete this Collection</Trans>
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
                    <DialogTitle>
                      <Trans>Could not delete this Collection</Trans>
                    </DialogTitle>
                    <DialogDescription>
                      {describeCoreError(
                        deleteErrorType,
                        deleteErrorDescriptions,
                        deleteErrorFallback
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose
                      render={<Button type="button" variant="secondary" />}
                    >
                      <Trans>Close</Trans>
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
            <DialogTitle>
              <Trans>Could not save this Collection</Trans>
            </DialogTitle>
            <DialogDescription>
              {describeCoreError(
                saveErrorType,
                saveErrorDescriptions,
                saveErrorFallback
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>
              <Trans>Close</Trans>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
