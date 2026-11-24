import { zodResolver } from '@hookform/resolvers/zod';
import { type MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { parseIpcError } from '@root/src/shared/ipcError';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useCallback, useId, useState, type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';

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
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useDefinitionsEditor } from '@renderer/hooks/useDefinitionsEditor';
import { useMissingTranslations } from '@renderer/hooks/useMissingTranslations';
import { useProject } from '@renderer/hooks/useProject';
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
import { languageName, translatableDefault } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  type CoreErrorType,
  type CreateComponentProps,
  getCreateComponentSchemaFromLanguages,
  type SupportedLanguage,
} from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/components/create')({
  component: ProjectComponentCreate,
  validateSearch: entryLanguageSearchSchema,
});

// The slug another Component holds is said below the Slug field, so only the
// refusal with no field to land on is left for this dialog. Core raises
// BadRequest for a Component whose dynamic field reaches back into itself,
// which is the one an editor meets here: every other reason a BadRequest could
// carry is already checked by the same schema this form resolves against.
const saveErrorDescriptions: Partial<Record<CoreErrorType, MessageDescriptor>> =
  {
    BadRequest: msg`A Component cannot use itself, not directly and not through another Component. Change which Components its dynamic Field allows and try again.`,
  };

const saveErrorFallback = msg`This Component could not be created. Please review your changes and try again.`;

function ProjectComponentCreate(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Create`);
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

  const createComponentForm = useAppForm({
    resolver: withBlankDefinitionDescriptionsAsNull(
      withEmptyDescriptionAsNull(zodResolver(generatedCreateComponentSchema))
    ),
    defaultValues: {
      projectId,
      name: {},
      slug: '',
      description: {},
      fieldDefinitions: [],
    },
    // A key per Project language, filled from the query rather than reset in an
    // effect, so what is already typed survives a refetch.
    ...(isReadingProject
      ? {}
      : {
          values: {
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
          },
        }),
    disabled: isReadingProject,
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
          message: t`Another Component in this Project already uses this slug. Choose another one.`,
        });
      },
      BadRequest: (error) => {
        setSaveError(error);
        setIsSaveErrorDialogOpen(true);
      },
    },
  });

  const definitions = useDefinitionsEditor({
    form: createComponentForm,
    owner: 'component',
    supportedLanguages: isReadingProject
      ? []
      : project.settings.language.supported,
  });

  // What keeps this Component from being created, in the words below the
  // button, as the Collection's settings say it.
  const languages = isReadingProject ? undefined : project.settings.language;
  const missingByLanguage = useMissingTranslations({
    form: createComponentForm,
    textsOf: useCallback(componentTranslatableTexts, []),
    languages,
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
    void navigate({
      search: (previous) => ({ ...previous, language: next }),
      replace: true,
      resetScroll: false,
    });
  };

  function Description(): ReactElement {
    return (
      <Trans>
        A Component is a group of fields an Entry can hold more than once, in
        any order. Its fields cannot be unique, and it holds no slug field.
      </Trans>
    );
  }

  function Actions(): ReactElement {
    return (
      <FormActions form={createComponentForm} id={formId} blockedBy={blockedBy}>
        <SubmitButton Icon={Check}>
          <Trans>Create Component</Trans>
        </SubmitButton>
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
      title={t`Create a new Component`}
      description={<Description />}
      actions={<Actions />}
    >
      <ComponentForm
        schema={generatedCreateComponentSchema}
        id={formId}
        componentForm={createComponentForm}
        project={project}
        definitions={definitions}
        language={shownLanguage}
        onLanguageChange={setLanguage}
        missingByLanguage={missingByLanguage}
        blockedBy={blockedBy}
        isViewOnly={isCreatingComponent}
        onFormSubmit={onCreate}
      />

      <Dialog
        open={isSaveErrorDialogOpen}
        onOpenChange={setIsSaveErrorDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Could not create this Component</Trans>
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
