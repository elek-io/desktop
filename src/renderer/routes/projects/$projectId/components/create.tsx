import { zodResolver } from '@hookform/resolvers/zod';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';

import { ComponentForm } from '@renderer/components/forms/component-form';
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
import { withEmptyDescriptionAsNull } from '@renderer/lib/resolver';
import { translatableDefault } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  type CoreErrorType,
  type CreateComponentProps,
  getCreateComponentSchemaFromLanguages,
} from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/components/create')({
  component: ProjectComponentCreate,
});

// The slug another Component holds is said below the Slug field, so only the
// refusal with no field to land on is left for this dialog. Core raises
// BadRequest for a Component whose dynamic field reaches back into itself,
// which is the one an editor meets here: every other reason a BadRequest could
// carry is already checked by the same schema this form resolves against.
const saveErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  BadRequest:
    'A Component cannot use itself, not directly and not through another Component. Change which Components its dynamic Field allows and try again.',
};

const saveErrorFallback =
  'This Component could not be created. Please review your changes and try again.';

function ProjectComponentCreate(): ReactElement {
  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, 'Create');
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  const [isSaveErrorDialogOpen, setIsSaveErrorDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const formId = useId();

  // Resolve against Core's language-aware schema, which requires a value for
  // every Project language. Falls back to an empty language set until the
  // Project loads, matching the Collection and Entry routes. This is Core's own
  // strict validator, so Desktop adds no refinement of its own, and the wrapper
  // only maps an all-blank description to the null Core calls "no description".
  const generatedCreateComponentSchema =
    isReadingProject === false
      ? getCreateComponentSchemaFromLanguages(
          project.settings.language.supported
        )
      : getCreateComponentSchemaFromLanguages([]);

  const createComponentForm = useForm({
    resolver: withEmptyDescriptionAsNull(
      zodResolver(generatedCreateComponentSchema)
    ),
    defaultValues: {
      projectId,
      name: {},
      slug: '',
      description: {},
      fieldDefinitions: [],
    },
  });

  // A slug another Component already uses lands on the Slug field, where it can
  // be fixed. A Component reaching back into itself has no field to land on, so
  // it opens the dialog below. See contributing/error-handling.md.
  const {
    mutateAsync: createComponent,
    isPending: isCreatingComponent,
    handleError: handleSaveError,
  } = useAppMutation(queryOptions.components.create, {
    handled: {
      Conflict: () => {
        createComponentForm.setError('slug', {
          type: 'conflict',
          message:
            'Another Component in this Project already uses this slug. Choose another one.',
        });
      },
      BadRequest: (error) => {
        setSaveError(error);
        setIsSaveErrorDialogOpen(true);
      },
    },
  });

  // Reset the form with the Project's languages when it loads
  useEffect(() => {
    if (project) {
      createComponentForm.reset({
        projectId,
        name: translatableDefault({
          supportedLanguages: project.settings.language.supported,
          defaultValue: '',
        }),
        slug: '',
        description: translatableDefault({
          supportedLanguages: project.settings.language.supported,
          defaultValue: '',
        }),
        fieldDefinitions: [],
      });
    }
  }, [projectId, project, createComponentForm]);

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
      <FormActions form={createComponentForm} id={formId}>
        <SubmitButton Icon={Check}>Create Component</SubmitButton>
      </FormActions>
    );
  }

  const onCreate: SubmitHandler<CreateComponentProps> = async (props) => {
    let component;
    try {
      component = await createComponent(props);
    } catch (error) {
      // A taken slug and a circular reference are surfaced in place above. Any
      // other failure was already routed to the boundary, so this is a no-op.
      handleSaveError(error);
      return;
    }
    await router.navigate({
      to: '/projects/$projectId/components/$componentId',
      params: { projectId, componentId: component.id },
    });
  };

  const { type: saveErrorType } = parseIpcError(saveError);

  if (isReadingProject) {
    return <></>;
  }

  return (
    <Page
      title="Create a new Component"
      description={<Description />}
      actions={<Actions />}
    >
      <ComponentForm
        id={formId}
        componentForm={createComponentForm}
        project={project}
        isViewOnly={isCreatingComponent}
        onFormSubmit={onCreate}
      />

      <Dialog
        open={isSaveErrorDialogOpen}
        onOpenChange={setIsSaveErrorDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Could not create this Component</DialogTitle>
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
