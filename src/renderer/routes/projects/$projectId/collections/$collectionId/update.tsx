import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check, Ellipsis, Trash2 } from 'lucide-react';
import { useCallback, useState, type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { CollectionForm } from '@renderer/components/forms/collection-form';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@renderer/components/ui/alert-dialog';
import { SubmitButton } from '@renderer/components/ui/app-form';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useDefinitionsEditor } from '@renderer/hooks/useDefinitionsEditor';
import { useMissingTranslations } from '@renderer/hooks/useMissingTranslations';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { DEFAULT_COLLECTION_ICON } from '@renderer/lib/collectionIcons';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import {
  entryLanguage,
  entryLanguageSearchSchema,
} from '@renderer/lib/entryLanguage';
import { collectionTranslatableTexts } from '@renderer/lib/missingTranslations';
import { withBlankDefinitionDescriptionsAsNull } from '@renderer/lib/resolver';
import { entryIssuesOf } from '@renderer/lib/schemaChange';
import { languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  getUpdateCollectionSchemaFromLanguages,
  type CoreErrorType,
  type SupportedLanguage,
  type UpdateCollectionProps,
} from '@elek-io/core';

export const Route = createFileRoute(
  '/projects/$projectId/collections/$collectionId/update'
)({
  component: ProjectCollectionUpdate,
  validateSearch: entryLanguageSearchSchema,
});

// Copy for a blocked delete, keyed by CoreError type.
const deleteErrorDescriptions: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  Conflict: msg`Entries in other Collections still point at Entries in this one, so it can't be deleted. Take those references out first, then try again.`,
};

const deleteErrorFallback = msg`This Collection could not be deleted. Please try again.`;

// Copy for a save Core refuses, keyed by CoreError type.
//
// Core answers this path with Conflict for two unrelated reasons: a slug
// another Collection already holds, which is said below the slug field, and a
// field change that reaches Entries that already exist, which it lists as the
// error's cause. What is left here is the second, which nothing can settle yet,
// see contributing/not-yet-implemented.md.
const saveErrorDescriptions: Partial<Record<CoreErrorType, MessageDescriptor>> =
  {
    Conflict: msg`Nothing was saved, and this Collection is exactly as it was. Your field changes reach Entries that already exist, and each one has to be settled before the change can go in, which elek.io Desktop cannot do yet. Put the field changes back for now.`,
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
  useBreadcrumb(Route, isReadingCollection ? undefined : t`Settings`);
  const [isSaveErrorDialogOpen, setIsSaveErrorDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // A slug already taken by another Collection is said below that slug's own
  // field. See contributing/error-handling.md.
  const {
    mutateAsync: updateCollection,
    isPending: isUpdatingCollection,
    handleError: handleSaveError,
  } = useAppMutation(queryOptions.collections.update, {
    handled: {
      Conflict: (error) => {
        // Core answers this path with Conflict for two unrelated reasons, and
        // the cause it attaches is what tells them apart: a field change it
        // cannot carry out alone comes with the Entries to settle, a slug
        // another Collection holds comes with nothing. Core checks the plural
        // slug alone, so that is the field it is said below.
        if (entryIssuesOf(error).length === 0) {
          updateCollectionForm.setError('slug.plural', {
            type: 'conflict',
            message: t`Another Collection in this Project already uses this slug. Choose another one.`,
          });
          return;
        }
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
  // Resolve against Core's language-aware schema, which requires a text for
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
    resolver: withBlankDefinitionDescriptionsAsNull(
      zodResolver(generatedUpdateCollectionSchema)
    ),
    // Seed every bound value so each control is controlled from the first
    // render, before the Collection arrives.
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
  const definitions = useDefinitionsEditor({
    form: updateCollectionForm,
    owner: 'collection',
    supportedLanguages: isReadingProject
      ? []
      : project.settings.language.supported,
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
  const title = t`Settings of the ${collectionName} Collection`;

  // What keeps this Collection from being saved, in the words below Save. Core
  // takes it only once every one of its names, labels and descriptions holds a
  // text in every language of the Project.
  const languages = isReadingProject ? undefined : project.settings.language;
  const missingByLanguage = useMissingTranslations({
    form: updateCollectionForm,
    textsOf: useCallback(collectionTranslatableTexts, []),
    languages: isReadingCollection ? undefined : languages,
  });
  const [missingLanguage, missingTexts] = [...missingByLanguage.entries()].find(
    ([, count]) => count > 0
  ) ?? [undefined, 0];
  const missing =
    missingLanguage === undefined ? undefined : languageName(missingLanguage);
  const blockedBy =
    missing === undefined
      ? undefined
      : t`${missing} is missing ${plural(missingTexts, { one: '# translation', other: '# translations' })}`;

  // The language every name, label and description is edited in, which stays in
  // the address, so coming back to the settings opens the language that was
  // left open.
  const navigate = Route.useNavigate();
  const supportedLanguages = languages?.supported ?? [];
  const shownLanguage = entryLanguage({
    search: Route.useSearch(),
    supportedLanguages,
    defaultLanguage: isReadingProject
      ? undefined
      : project.settings.language.default,
  });
  const setLanguage = (next: SupportedLanguage): void => {
    // It replaces rather than pushes, so the way back leads out of the settings
    // rather than through every language that was looked at.
    void navigate({
      search: (previous) => ({ ...previous, language: next }),
      replace: true,
      resetScroll: false,
    });
  };

  const onUpdate: SubmitHandler<UpdateCollectionProps> = async (props) => {
    try {
      await updateCollection(props);
    } catch (error) {
      // A refusal that belongs on this screen is answered above. Any other
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

  const onDelete = async (): Promise<void> => {
    try {
      await deleteCollection({ projectId, id: collectionId });
      setIsDeleteConfirmOpen(false);
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
      setIsDeleteConfirmOpen(false);
      handleDeleteError(error);
    }
  };

  const { type: deleteErrorType } = parseIpcError(deleteError);
  const { type: saveErrorType } = parseIpcError(saveError);

  if (isReadingProject) {
    return <></>;
  }

  return (
    <>
      <CollectionForm
        schema={generatedUpdateCollectionSchema}
        collectionForm={updateCollectionForm}
        project={project}
        definitions={definitions}
        title={title}
        language={shownLanguage}
        onLanguageChange={setLanguage}
        missingByLanguage={missingByLanguage}
        blockedBy={blockedBy}
        isViewOnly={isUpdatingCollection}
        onFormSubmit={onUpdate}
        unsavedChangesTitle={title}
        submit={
          <SubmitButton requireDirty Icon={Check}>
            <Trans>Save</Trans>
          </SubmitButton>
        }
        more={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  Icon={Ellipsis}
                  aria-label={t`More for ${collectionName}`}
                />
              }
            />
            <DropdownMenuPortal>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setIsDeleteConfirmOpen(true)}
                >
                  <Trash2 />
                  <Trans>Delete Collection</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        }
      />

      {/*
        The confirm names what goes and who it reaches, as ci rules for
        deleting. Its red button is a Button rather than the dialog's own
        action, so the dialog stays until the delete answered and a refusal can
        take its place.
      */}
      <AlertDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Delete {collectionName}?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                Every Entry of this Collection goes with it, in every language,
                and for everyone on this Project once you sync.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <Button
              variant="destructive"
              Icon={Trash2}
              onClick={() => void onDelete()}
            >
              <Trans>Delete Collection</Trans>
            </Button>
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
            <DialogClose render={<Button type="button" variant="ghost" />}>
              <Trans>Close</Trans>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogClose render={<Button type="button" variant="ghost" />}>
              <Trans>Close</Trans>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
