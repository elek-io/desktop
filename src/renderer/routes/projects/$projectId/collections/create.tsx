import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

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
const saveErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  Conflict:
    'Another Collection in this Project already uses one of these slugs. Change the singular or plural slug and try again.',
};

const saveErrorFallback =
  'This Collection could not be created. Please review your changes and try again.';

function ProjectCollectionCreate(): ReactElement {
  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'Create');
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

  const createCollectionForm = useForm({
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
  });

  // Reset form with Project data when it loads
  useEffect(() => {
    if (project) {
      createCollectionForm.reset({
        projectId,
        icon: 'home',
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
      });
    }
  }, [projectId, project, createCollectionForm]);

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
      <FormActions form={createCollectionForm} id={formId}>
        <SubmitButton Icon={Check}>Create Collection</SubmitButton>
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
      title="Create a new Collection"
      description={<Description />}
      actions={<Actions />}
    >
      <CollectionForm
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
            <DialogTitle>Could not create this Collection</DialogTitle>
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
