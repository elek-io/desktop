import { Trans, useLingui } from '@lingui/react/macro';
import { type ReactElement } from 'react';
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
import { AppField, AppForm } from '@renderer/components/ui/app-form';
import {
  TextareaControl,
  TextControl,
} from '@renderer/components/ui/field-controls';
import { type DefinitionsEditorState } from '@renderer/hooks/useDefinitionsEditor';

import { type Project, type SupportedLanguage } from '@elek-io/core';

// TFieldValues is the schema input (loose), TTransformedValues the schema output
// handleSubmit yields. See contributing/renderer/forms.md#form-typing.
interface ComponentFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
> {
  componentForm: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  project: Project;
  /**
   * The Core schema this form checks against, which its fields read their own
   * rules off, so no limit Core sets is written out here.
   */
  schema: unknown;
  /** The field definitions of this form, with which of them is open. */
  definitions: DefinitionsEditorState;
  /** The Component's own name, which the fields are filled in for. */
  componentName: string;
  /** The language every name, label and description is edited in. */
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  /** How many texts each language is still missing. */
  missingByLanguage: Map<SupportedLanguage, number>;
  /** Why the Component cannot be saved yet, see `AppForm`. */
  blockedBy?: string | undefined;
  children?: React.ReactNode;
  isViewOnly?: boolean;
  onFormSubmit?: SubmitHandler<TTransformedValues>;
  /**
   * Associates the form with a submit button rendered outside it (in the page
   * header via `Page`'s `actions`). That button carries `type="submit"` and the
   * same `form={id}`, so it submits this form from outside its subtree.
   */
  id?: string;
  /** The page's title, which turns the leave guard on, see `AppForm`. */
  unsavedChangesTitle?: string | undefined;
}

/**
 * Shared form body of a Component: its name, slug and description, then the
 * fields it defines through the editor a Collection uses too.
 *
 * The Component screen keeps its own layout until it is rebuilt, so the pane of
 * the chosen field stands beside the fields inside the page rather than as a
 * pane of the main panel.
 *
 * Generic over the form values, because the create (`projectId`), update
 * (`id`) and view-only shapes diverge and cannot be one union prop. Only the
 * field names are asserted as paths, never the whole form, so the cast
 * guardrail stays intact. See contributing/renderer/forms.md#form-typing.
 */
export function ComponentForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  componentForm,
  project,
  schema,
  definitions,
  componentName,
  language,
  onLanguageChange,
  missingByLanguage,
  blockedBy,
  children,
  isViewOnly = false,
  onFormSubmit = () => {},
  id,
  unsavedChangesTitle,
}: ComponentFormProps<TFieldValues, TTransformedValues>): ReactElement {
  const { t } = useLingui();
  const supportedLanguages = project.settings.language.supported;
  const path = (name: string): FieldPath<TFieldValues> =>
    name as FieldPath<TFieldValues>;
  const hasPane = definitions.isAddingField || definitions.chosen !== undefined;

  return (
    <AppForm
      form={componentForm}
      schema={schema}
      onSubmit={onFormSubmit}
      id={id}
      mode={isViewOnly ? 'view' : 'edit'}
      blockedBy={blockedBy}
      unsavedChangesTitle={unsavedChangesTitle}
    >
      {/* One switch for every name, label and description of the page, as the
      Collection's settings have it. A Project of one language has nothing to
      switch between, so it carries no row. */}
      {supportedLanguages.length > 1 ? (
        <div className="flex items-center gap-3 pb-4">
          <LanguageSwitch
            languages={supportedLanguages.map((candidate) => ({
              language: candidate,
              missing: missingByLanguage.get(candidate) ?? 0,
              hasError: false,
            }))}
            language={language}
            onLanguageChange={onLanguageChange}
            missingWords={(count) => t`${count} translations`}
          />
          <p className="text-small text-muted-foreground">
            <Trans>
              Switches names, labels and descriptions. Slugs and fields are the
              same in every language.
            </Trans>
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-x-6 gap-y-4">
        <AppField
          form={componentForm}
          name={path(`name.${language}`)}
          label={<Trans>Component name</Trans>}
          description={
            <Trans>
              What this group of fields is, in singular, such as
              &quot;Teaser&quot;.
            </Trans>
          }
          className="col-span-12 @min-[344px]:col-span-6"
        >
          {({ field, controlProps }) => (
            <TextControl field={field} type="text" {...controlProps} />
          )}
        </AppField>

        <AppField
          form={componentForm}
          name={path('slug')}
          label={<Trans>Component slug</Trans>}
          description={
            <Trans>
              Names this Component in your code. It has to be unique in this
              Project.
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
          form={componentForm}
          name={path(`description.${language}`)}
          label={<Trans>Description</Trans>}
          description={
            <Trans>What this Component is used for, for your team.</Trans>
          }
          className="col-span-12"
        >
          {({ field, controlProps }) => (
            <TextareaControl field={field} rows={2} {...controlProps} />
          )}
        </AppField>
      </div>

      <div className="-mx-(--pane-edge) mt-6 flex min-w-0 items-start">
        <div className="min-w-0 flex-1">
          <FieldDefinitionsList
            form={componentForm}
            definitions={definitions}
            owner="component"
            ownerName={componentName}
            isViewOnly={isViewOnly}
          />
        </div>
        {hasPane ? (
          <aside
            aria-label={t`the settings of the chosen field`}
            className="w-74 flex-none border-l [--pane-edge:16px]"
          >
            <FieldDefinitionsPane
              form={componentForm}
              definitions={definitions}
              owner="component"
              supportedLanguages={supportedLanguages}
              language={language}
            />
          </aside>
        ) : null}
      </div>
      {children}
    </AppForm>
  );
}
