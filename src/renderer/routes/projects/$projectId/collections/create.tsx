import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { CollectionForm } from '@renderer/components/forms/collection-form';
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
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useProject } from '@renderer/hooks/useProject';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { translatableDefault } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  type CoreErrorType,
  type CreateCollectionProps,
  getCreateCollectionSchemaFromLanguages,
} from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/collections/create')(
  {
    component: ProjectCollectionCreate,
  }
);

// Copy for a blocked create, keyed by CoreError type. Slug uniqueness is only
// checked by Core, so a collision arrives as a Conflict rather than a zod error.
const saveErrorDescriptions: Partial<Record<CoreErrorType, MessageDescriptor>> =
  {
    Conflict: msg`Another Collection in this Project already uses one of these slugs. Change the singular or plural slug and try again.`,
  };

const saveErrorFallback = msg`This Collection could not be created. Please review your changes and try again.`;

function ProjectCollectionCreate(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Create`);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const [isSaveErrorDialogOpen, setIsSaveErrorDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  // A slug already taken by another Collection is handled in place.
  // See contributing/error-handling.md.
  const {
    mutateAsync: createCollection,
    isPending: isCreatingCollection,
    handleError: handleSaveError,
  } = useAppMutation(queryOptions.collections.create, {
    handled: {
      Conflict: (error) => {
        setSaveError(error);
        setIsSaveErrorDialogOpen(true);
      },
    },
  });
  const formId = useId();

  // Resolve against Core's language-aware schema, which requires a value for
  // every Project language. Falls back to an empty language set until the
  // Project loads, matching the Entry routes. This is Core's own strict
  // validator, so Desktop adds no refinement of its own.
  const generatedCreateCollectionSchema =
    isReadingProject === false
      ? getCreateCollectionSchemaFromLanguages(
          project.settings.language.supported
        )
      : getCreateCollectionSchemaFromLanguages([]);

  const createCollectionForm = useAppForm({
    resolver: zodResolver(generatedCreateCollectionSchema),
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
    // A key per Project language, filled from the query rather than reset in an
    // effect, so what is already typed survives a refetch.
    ...(isReadingProject
      ? {}
      : {
          values: {
            projectId,
            icon: 'home' as const,
            name: {
              singular: translatableDefault({
                supportedLanguages: project.settings.language.supported,
                defaultValue: '',
              }),
              plural: translatableDefault({
                supportedLanguages: project.settings.language.supported,
                defaultValue: '',
              }),
            },
            description: translatableDefault({
              supportedLanguages: project.settings.language.supported,
              defaultValue: '',
            }),
            slug: {
              singular: '',
              plural: '',
            },
            fieldDefinitions: [],
          },
        }),
    disabled: isReadingProject,
  });

  function Description(): ReactElement {
    return (
      <Trans>
        A Collection holds information about how your content is structured.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={createCollectionForm} id={formId}>
        <SubmitButton Icon={Check}>
          <Trans>Create Collection</Trans>
        </SubmitButton>
      </FormActions>
    );
  }

  const onCreate: SubmitHandler<CreateCollectionProps> = async (props) => {
    let collection;
    try {
      collection = await createCollection(props);
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
        collectionId: collection.id,
      },
    });
  };

  const { type: saveErrorType } = parseIpcError(saveError);

  if (isReadingProject) {
    return <></>;
  }

  return (
    <Page
      title={t`Create a new Collection`}
      description={<Description />}
      actions={<Actions />}
    >
      <CollectionForm
        schema={generatedCreateCollectionSchema}
        id={formId}
        collectionForm={createCollectionForm}
        project={project}
        isViewOnly={isCreatingCollection}
        onFormSubmit={onCreate}
      />

      <Dialog
        open={isSaveErrorDialogOpen}
        onOpenChange={setIsSaveErrorDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Could not create this Collection</Trans>
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
