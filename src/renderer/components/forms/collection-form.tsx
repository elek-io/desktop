import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement, type ReactNode } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import {
  FieldDefinitionsList,
  FieldDefinitionsPane,
} from '@renderer/components/forms/field-definitions-editor';
import { LanguageSwitch } from '@renderer/components/language-switch';
import { Pane, PaneHead, Panes } from '@renderer/components/pane';
import {
  AppField,
  AppForm,
  FormActions,
} from '@renderer/components/ui/app-form';
import {
  TextareaControl,
  TextControl,
} from '@renderer/components/ui/field-controls';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { type DefinitionsEditorState } from '@renderer/hooks/useDefinitionsEditor';
import { uniqueNote } from '@renderer/lib/fieldRules';

import { type Project, type SupportedLanguage } from '@elek-io/core';

// A Collection's settings: one page with its names, its slugs and its
// description, then the fields it defines as editors see them, and the pane of
// 296 px beside them.
//
// The whole screen stands inside the one form it is saved from, so the pane
// beside the fields edits the same unsaved state the fields do and the page has
// one Save, see contributing/renderer/forms.md#a-collections-settings.

// TFieldValues is the schema input, TTransformedValues the schema output
// handleSubmit yields. Neither is constrained to a shape holding the keys this
// addresses: a generated Core schema's input type for the field definitions is
// not `FieldDefinitionOrGroup[]` itself, so such a constraint would reject
// every real caller. See contributing/renderer/forms.md#form-typing.
interface CollectionFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
> {
  collectionForm: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  project: Project;
  /**
   * The Core schema this form checks against, which its fields read their own
   * rules off, so no limit Core sets is written out here.
   */
  schema: unknown;
  /** The field definitions of this form, with which of them is open. */
  definitions: DefinitionsEditorState;
  /** The page's title, which the question before losing changes names too. */
  title: string;
  /** The screen's one primary button. */
  submit: ReactNode;
  /** The More menu beside it, which a Collection that exists carries. */
  more?: ReactNode;
  /** The language every name, label and description is edited in. */
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  /** How many texts each language is still missing. */
  missingByLanguage: Map<SupportedLanguage, number>;
  /** Why the Collection cannot be saved yet, see `AppForm`. */
  blockedBy?: string | undefined;
  isViewOnly?: boolean;
  onFormSubmit?: SubmitHandler<TTransformedValues>;
  /** The page's title, which turns the leave guard on, see `AppForm`. */
  unsavedChangesTitle?: string | undefined;
}

export function CollectionForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  collectionForm,
  project,
  schema,
  definitions,
  title,
  submit,
  more,
  language,
  onLanguageChange,
  missingByLanguage,
  blockedBy,
  isViewOnly = false,
  onFormSubmit = () => {},
  unsavedChangesTitle,
}: CollectionFormProps<TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();
  const supportedLanguages = project.settings.language.supported;
  // Every form this serves holds these keys, but react-hook-form's FieldPath
  // cannot resolve a literal path for an unresolved generic, so each name is
  // asserted here. Asserting the name rather than the whole form is what keeps
  // the form-cast guardrail intact, see
  // contributing/renderer/forms.md#form-typing.
  const path = (name: string): FieldPath<TFieldValues> =>
    name as FieldPath<TFieldValues>;
  // A slug has to be unique within the Project, which Core enforces where it
  // saves rather than in the schema, so the field says it beside what the
  // schema says.
  const unique = [uniqueNote()];
  // Whether the pane beside the fields has anything to show, which is what
  // decides if the screen draws a second pane at all.
  const hasPane = definitions.isAddingField || definitions.chosen !== undefined;

  return (
    <AppForm
      form={collectionForm}
      schema={schema}
      onSubmit={onFormSubmit}
      mode={isViewOnly ? 'view' : 'edit'}
      blockedBy={blockedBy}
      unsavedChangesTitle={unsavedChangesTitle}
      className="flex min-h-0 flex-1"
      fieldsetClassName="flex min-h-0 w-full flex-1"
    >
      <Panes>
        {/* The settings are what the screen is about, so they are the one main
        landmark, with the pane of the chosen field beside them. */}
        <Pane name={t`these settings`}>
          <main className="flex min-h-0 flex-1 flex-col">
            <PaneHead className="pb-1.5">
              <h1 className="min-w-0 flex-1 truncate text-h3">{title}</h1>
              {more}
              <FormActions form={collectionForm} blockedBy={blockedBy}>
                {submit}
              </FormActions>
            </PaneHead>
            {/* The switch stands below the title and above the fields, which
            is where ci draws it, with the line that says what it switches. A
            Project of one language has nothing to switch between, so it
            carries no row. */}
            {supportedLanguages.length > 1 ? (
              <div className="flex items-center gap-3 px-(--pane-edge) pb-4">
                <LanguageSwitch
                  languages={supportedLanguages.map((candidate) => ({
                    language: candidate,
                    missing: missingByLanguage.get(candidate) ?? 0,
                    hasError: false,
                  }))}
                  language={language}
                  onLanguageChange={onLanguageChange}
                  missingWords={(count) =>
                    plural(count, {
                      one: '# translation',
                      other: '# translations',
                    })
                  }
                />
                {/* The sentence gives way rather than taking the room the
                switch needs for ci's segments, so it wraps instead of the
                switch collapsing to a dropdown. */}
                <p className="min-w-0 flex-1 text-small text-muted-foreground">
                  <Trans>
                    Switches names, labels and descriptions. Slugs and fields
                    are the same in every language.
                  </Trans>
                </p>
              </div>
            ) : null}
            <ScrollArea className="flex-1">
              {/* A query container, so a pair of fields stacks by the room the
              editor has rather than by the width of the window, which is the
              measure ci draws them against. */}
              <div className="@container grid grid-cols-12 gap-x-6 gap-y-4 px-(--pane-edge) pb-6">
                <AppField
                  form={collectionForm}
                  name={path(`name.plural.${language}`)}
                  label={<Trans>Collection name</Trans>}
                  description={
                    <Trans>In plural, such as &quot;Blog posts&quot;.</Trans>
                  }
                  className="col-span-12 @min-[344px]:col-span-6"
                >
                  {({ field, controlProps }) => (
                    <TextControl field={field} type="text" {...controlProps} />
                  )}
                </AppField>

                <AppField
                  form={collectionForm}
                  name={path(`name.singular.${language}`)}
                  label={<Trans>Entry name</Trans>}
                  description={
                    <Trans>
                      In singular, for one Entry, such as &quot;Blog post&quot;.
                    </Trans>
                  }
                  className="col-span-12 @min-[344px]:col-span-6"
                >
                  {({ field, controlProps }) => (
                    <TextControl field={field} type="text" {...controlProps} />
                  )}
                </AppField>

                <AppField
                  form={collectionForm}
                  name={path('slug.plural')}
                  label={<Trans>Collection slug</Trans>}
                  notes={unique}
                  description={
                    <Trans>
                      Names this Collection in your code and in API paths.
                    </Trans>
                  }
                  className="col-span-12 @min-[344px]:col-span-6"
                >
                  {({ field, controlProps }) => (
                    <TextControl
                      field={field}
                      type="text"
                      className="font-mono"
                      {...controlProps}
                    />
                  )}
                </AppField>

                <AppField
                  form={collectionForm}
                  name={path('slug.singular')}
                  label={<Trans>Entry slug</Trans>}
                  notes={unique}
                  description={<Trans>The Collection slug in singular.</Trans>}
                  className="col-span-12 @min-[344px]:col-span-6"
                >
                  {({ field, controlProps }) => (
                    <TextControl
                      field={field}
                      type="text"
                      className="font-mono"
                      {...controlProps}
                    />
                  )}
                </AppField>

                <AppField
                  form={collectionForm}
                  name={path(`description.${language}`)}
                  label={<Trans>Description</Trans>}
                  description={
                    <Trans>What this Collection holds, for your team.</Trans>
                  }
                  className="col-span-12"
                >
                  {({ field, controlProps }) => (
                    <TextareaControl field={field} rows={2} {...controlProps} />
                  )}
                </AppField>
              </div>

              <FieldDefinitionsList
                form={collectionForm}
                definitions={definitions}
                owner="collection"
                ownerNamePath={path(`name.plural.${language}`)}
                isViewOnly={isViewOnly}
              />
            </ScrollArea>
          </main>
        </Pane>
        {hasPane ? (
          <Pane width="list" name={t`the settings of the chosen field`}>
            <FieldDefinitionsPane
              form={collectionForm}
              definitions={definitions}
              owner="collection"
              supportedLanguages={supportedLanguages}
              language={language}
            />
          </Pane>
        ) : null}
      </Panes>
    </AppForm>
  );
}
