import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Ellipsis, Trash2 } from 'lucide-react';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';
import { type z } from 'zod';

import { ComponentForm } from '@renderer/components/forms/component-form';
import {
  RefusedChangeDialog,
  type RefusedChangeAnswer,
} from '@renderer/components/refused-change-dialog';
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
import { useKeptForm } from '@renderer/hooks/useKeptForm';
import { useMissingTranslations } from '@renderer/hooks/useMissingTranslations';
import { useProject } from '@renderer/hooks/useProject';
import { useQueryNoError } from '@renderer/hooks/useQueryNoError';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import {
  entryLanguage,
  entryLanguageSearchSchema,
} from '@renderer/lib/entryLanguage';
import { componentTranslatableTexts } from '@renderer/lib/missingTranslations';
import {
  withBlankDefinitionDescriptionsAsNull,
  withEmptyDescriptionAsNull,
} from '@renderer/lib/resolver';
import {
  entryIssuesOf,
  type SchemaChangeIssue,
} from '@renderer/lib/schemaChange';
import { languageName } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  flattenFieldDefinitions,
  getUpdateComponentSchemaFromLanguages,
  type CoreErrorType,
  type SupportedLanguage,
  type UpdateComponentProps,
} from '@elek-io/core';

/**
 * The Component as the form holds it, which is the input of the same Core
 * schema the form resolves against, so what is kept across a link to an Entry
 * goes back in exactly as it came out.
 */
type ComponentSettingsValues = z.input<
  ReturnType<typeof getUpdateComponentSchemaFromLanguages>
>;

export const Route = createFileRoute(
  '/projects/$projectId/components/$componentId'
)({
  component: ProjectComponentUpdate,
  validateSearch: entryLanguageSearchSchema,
});

// Copy for a blocked delete, keyed by CoreError type.
const deleteErrorDescriptions: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  Conflict: msg`A Collection or another Component still uses this Component, so it cannot be deleted. Take it out of the Fields that allow it first, then try again.`,
};

const deleteErrorFallback = msg`This Component could not be deleted. Please review and try again.`;

// Copy for a blocked save, keyed by CoreError type. A slug another Component
// holds is said below the Slug field, and a Field change that reaches Entries
// that already exist is answered in the dialog of a refused change, so what is
// left here is the circular reference BadRequest.
const saveErrorDescriptions: Partial<Record<CoreErrorType, MessageDescriptor>> =
  {
    BadRequest: msg`A Component cannot use itself, not directly and not through another Component. Change which Components its dynamic Field allows and try again.`,
  };

const saveErrorFallback = msg`This Component could not be saved. Please review your changes and try again.`;

function ProjectComponentUpdate(): ReactElement {
  const { t } = useLingui();

  const navigate = Route.useNavigate();
  const { projectId, componentId } = Route.useParams();
  // Save, which the dialog of a refused change hands the focus back to.
  const saveRef = useRef<HTMLButtonElement>(null);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
    translateContent,
  } = useProject();
  const { data: component, isPending: isReadingComponent } = useQueryNoError(
    queryOptions.components.read({ projectId, id: componentId })
  );
  useBreadcrumb(
    Route,
    isReadingComponent
      ? undefined
      : translateContent({ key: 'component.name', record: component.name })
  );
  const [isSaveErrorDialogOpen, setIsSaveErrorDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  // The change Core refused and everything it refused it for, which is what
  // the dialog over this page draws and applies.
  const [refused, setRefused] = useState<{
    props: UpdateComponentProps;
    issues: SchemaChangeIssue[];
  } | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
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

  // What these settings kept for themselves while an Entry of the dialog below
  // was being fixed, so coming back shows them as they were left.
  const keptSettings = useKeptForm<ComponentSettingsValues>(
    // The key of this page, which nothing reads, so it is not a string
    // somebody reads either.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    `components/${componentId}/settings`
  );

  const updateComponentForm = useAppForm({
    resolver: withBlankDefinitionDescriptionsAsNull(
      withEmptyDescriptionAsNull(zodResolver(generatedUpdateComponentSchema))
    ),
    // Seed every bound value so each control is controlled from the first
    // render, before the Component arrives.
    defaultValues: {
      projectId,
      id: componentId,
      name: {},
      slug: '',
      description: {},
      fieldDefinitions: [],
    },
    // Filled from the query rather than reset in an effect, so a refetch keeps
    // what is being typed. The stored field definitions go back as they are,
    // ids included, which is what keeps the content of every Entry holding this
    // Component: Core matches field definitions by id, so a new id would read
    // as a removal plus an addition.
    //
    // What was kept wins over what is stored, since it is what was typed, and
    // the defaults it is compared against stay what they were, so the page
    // comes back holding unsaved changes.
    ...(keptSettings.kept === undefined
      ? isReadingComponent
        ? {}
        : { values: { ...component, projectId } }
      : {
          values: keptSettings.kept,
          resetOptions: { keepDefaultValues: true },
        }),
    disabled: isReadingComponent,
  });

  const definitions = useDefinitionsEditor({
    form: updateComponentForm,
    owner: 'component',
    supportedLanguages: isReadingProject
      ? []
      : project.settings.language.supported,
  });

  // Core raises Conflict on this path for two unrelated reasons, and the cause
  // it attaches is what tells them apart: a Field change it cannot carry out
  // alone comes with every issue it names, a slug another Component holds
  // comes with nothing. The Field change is answered where the save is, since
  // the dialog sends the very same change again.
  // See contributing/error-handling.md.
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
            message: t`Another Component in this Project already uses this slug. Choose another one.`,
          });
        }
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

  // The Component's name, or the domain term while it is still loading, so the
  // title takes one placeholder rather than being assembled around it.
  const name = isReadingComponent
    ? t`Component`
    : translateContent({ key: 'component.name', record: component.name });
  const title = t`Settings of the ${name} Component`;

  // What keeps this Component from being saved, in the words below Save. Core
  // takes it only once every one of its names, labels and descriptions holds a
  // text in every language of the Project.
  const languages = isReadingProject ? undefined : project.settings.language;
  const missingByLanguage = useMissingTranslations({
    form: updateComponentForm,
    textsOf: useCallback(componentTranslatableTexts, []),
    languages: isReadingComponent ? undefined : languages,
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
  // the address, as the Collection's settings have it.
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

  /**
   * Saves the Component, and answers a Field change Core refuses with the one
   * dialog that says what the change would delete and which Entries need a
   * Value.
   *
   * The change is sent again from there with what Core takes back, so the
   * props are kept with the refusal: it is the very same change, which is what
   * Core's acceptance is written for.
   */
  const save = async (props: UpdateComponentProps): Promise<void> => {
    try {
      await updateComponent(props);
    } catch (error) {
      const issues = entryIssuesOf(error);

      if (issues.length > 0) {
        setRefused({ props, issues });
        return;
      }
      // A taken slug and a circular reference are surfaced in place above. Any
      // other failure was already routed to the boundary, so this is a no-op.
      handleSaveError(error);
      return;
    }
    setRefused(null);
    // The Component stays chosen beside its list, so this page stays open and
    // the form is made pristine again with what went in. Without it Save would
    // stay available and leaving would ask about changes that are saved.
    updateComponentForm.reset(updateComponentForm.getValues());
  };

  const onUpdate: SubmitHandler<UpdateComponentProps> = async (props) => {
    await save(props);
  };

  /**
   * Applies the refused change with what Core takes back. A Component's
   * resolutions are not sent, see the dialog.
   */
  const onApplyRefusedChange = async ({
    acceptedContentLoss,
  }: RefusedChangeAnswer): Promise<void> => {
    if (refused === null) {
      return;
    }
    await save({ ...refused.props, acceptedContentLoss });
  };

  const onDelete = async (): Promise<void> => {
    try {
      await deleteComponent({ projectId, id: componentId });
      setIsDeleteConfirmOpen(false);
      // The page takes this way out itself, so leaving it asks nothing: the
      // Component and everything typed into it are gone.
      await navigate({
        to: '/projects/$projectId/components',
        params: { projectId },
        ignoreBlocker: true,
      });
    } catch (error) {
      setIsDeleteConfirmOpen(false);
      handleDeleteError(error);
    }
  };

  const { type: saveErrorType } = parseIpcError(saveError);
  const { type: deleteErrorType } = parseIpcError(deleteError);

  if (isReadingProject) {
    return <></>;
  }

  return (
    <>
      <ComponentForm
        schema={generatedUpdateComponentSchema}
        componentForm={updateComponentForm}
        project={project}
        definitions={definitions}
        title={title}
        language={shownLanguage}
        onLanguageChange={setLanguage}
        missingByLanguage={missingByLanguage}
        blockedBy={blockedBy}
        isViewOnly={isUpdatingComponent}
        onFormSubmit={onUpdate}
        unsavedChangesTitle={title}
        submit={
          <SubmitButton ref={saveRef} requireDirty Icon={Check}>
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
                  aria-label={t`More for ${name}`}
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
                  <Trans>Delete Component</Trans>
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
              <Trans>Delete {name}?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>
                It goes for everyone on this Project once you sync, in every
                language.
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
              <Trans>Delete Component</Trans>
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
              <Trans>Could not delete this Component</Trans>
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
              <Trans>Could not save this Component</Trans>
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

      {/* The one dialog a field change Core refuses opens: what the save would
      delete, and the Entries that need a Value, each by its title and leading
      to the Entry. A Component's Values are written nowhere yet, so those rows
      say what there is to do instead. */}
      <RefusedChangeDialog
        open={refused !== null}
        question={t`Save the changes to the ${name} Component?`}
        issues={refused?.issues ?? []}
        storedFieldDefinitions={
          isReadingComponent
            ? []
            : flattenFieldDefinitions(component.fieldDefinitions)
        }
        newFieldDefinitions={
          refused === null
            ? []
            : flattenFieldDefinitions(refused.props.fieldDefinitions)
        }
        resolvable={false}
        language={shownLanguage}
        returnFocusTo={saveRef}
        onCancel={() => setRefused(null)}
        onApply={onApplyRefusedChange}
        onFollowLink={() => keptSettings.keep(updateComponentForm.getValues())}
      />
    </>
  );
}
