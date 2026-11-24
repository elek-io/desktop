import { zodResolver } from '@hookform/resolvers/zod';
import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useCallback, type ReactElement } from 'react';
import { type SubmitHandler } from 'react-hook-form';

import { CollectionForm } from '@renderer/components/forms/collection-form';
import { SubmitButton } from '@renderer/components/ui/app-form';
import { useAppForm } from '@renderer/hooks/useAppForm';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { useBreadcrumb } from '@renderer/hooks/useBreadcrumb';
import { useDefinitionsEditor } from '@renderer/hooks/useDefinitionsEditor';
import { useMissingTranslations } from '@renderer/hooks/useMissingTranslations';
import { useProject } from '@renderer/hooks/useProject';
import { DEFAULT_COLLECTION_ICON } from '@renderer/lib/collectionIcons';
import {
  entryLanguage,
  entryLanguageSearchSchema,
} from '@renderer/lib/entryLanguage';
import { collectionTranslatableTexts } from '@renderer/lib/missingTranslations';
import { withBlankDefinitionDescriptionsAsNull } from '@renderer/lib/resolver';
import { languageName, translatableDefault } from '@renderer/lib/utils';
import { queryOptions } from '@renderer/queries';

import {
  getCreateCollectionSchemaFromLanguages,
  type CreateCollectionProps,
  type SupportedLanguage,
} from '@elek-io/core';

export const Route = createFileRoute('/projects/$projectId/collections/create')(
  {
    component: ProjectCollectionCreate,
    validateSearch: entryLanguageSearchSchema,
  }
);

function ProjectCollectionCreate(): ReactElement {
  const { t } = useLingui();

  const router = useRouter();
  const { projectId } = Route.useParams();
  useBreadcrumb(Route, t`Create Collection`);
  const {
    projectQuery: { data: project, isPending: isReadingProject },
  } = useProject();
  // A slug another Collection already holds is said below that slug's own
  // field. See contributing/error-handling.md.
  const {
    mutateAsync: createCollection,
    isPending: isCreatingCollection,
    handleError: handleSaveError,
  } = useAppMutation(queryOptions.collections.create, {
    handled: {
      Conflict: () => {
        createCollectionForm.setError('slug.plural', {
          type: 'conflict',
          message: t`Another Collection in this Project already uses this slug. Choose another one.`,
        });
      },
    },
  });

  // Resolve against Core's language-aware schema, which requires a text for
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
    resolver: withBlankDefinitionDescriptionsAsNull(
      zodResolver(generatedCreateCollectionSchema)
    ),
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
    // A key per Project language, filled from the query rather than reset in an
    // effect, so what is already typed survives a refetch.
    ...(isReadingProject
      ? {}
      : {
          values: {
            projectId,
            icon: DEFAULT_COLLECTION_ICON,
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
  const definitions = useDefinitionsEditor({
    form: createCollectionForm,
    owner: 'collection',
    supportedLanguages: isReadingProject
      ? []
      : project.settings.language.supported,
  });

  // What keeps this Collection from being created, in the words below the
  // button. Core takes it only once every one of its names, labels and
  // descriptions holds a text in every language of the Project.
  const languages = isReadingProject ? undefined : project.settings.language;
  const missingByLanguage = useMissingTranslations({
    form: createCollectionForm,
    textsOf: useCallback(collectionTranslatableTexts, []),
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

  // The language every name, label and description is written in, which stays
  // in the address, so the language a new Collection was started in survives a
  // reload.
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

  const onCreate: SubmitHandler<CreateCollectionProps> = async (props) => {
    let collection;
    try {
      collection = await createCollection(props);
    } catch (error) {
      // A taken slug is said below its own field. Any other failure was
      // already routed to the boundary, so this is a no-op for it.
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

  if (isReadingProject) {
    return <></>;
  }

  const title = t`Create Collection`;

  return (
    <CollectionForm
      schema={generatedCreateCollectionSchema}
      collectionForm={createCollectionForm}
      project={project}
      definitions={definitions}
      title={title}
      collectionName={t`Collection`}
      language={shownLanguage}
      onLanguageChange={setLanguage}
      missingByLanguage={missingByLanguage}
      blockedBy={blockedBy}
      isViewOnly={isCreatingCollection}
      onFormSubmit={onCreate}
      unsavedChangesTitle={title}
      submit={
        <SubmitButton Icon={Check}>
          <Trans>Create Collection</Trans>
        </SubmitButton>
      }
    />
  );
}
