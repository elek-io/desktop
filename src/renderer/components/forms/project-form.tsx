import { Trans, useLingui } from '@lingui/react/macro';
import { Plus, XIcon } from 'lucide-react';
import { useState } from 'react';
import { type SubmitHandler, type UseFormReturn } from 'react-hook-form';

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
} from '@renderer/components/ui/alert-dialog';
import { AppField, AppForm } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import { Chip } from '@renderer/components/ui/chip';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '@renderer/components/ui/combobox';
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
  TextControl,
  TextareaControl,
} from '@renderer/components/ui/field-controls';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';

import {
  supportedLanguageSchema,
  type CreateProjectProps,
  type SupportedLanguage,
} from '@elek-io/core';

/**
 * What a Project form edits, which is every key of a Project a person can
 * change. An update carries the Project's id beside it, which the route holds
 * and no field writes, so both the create and the update form are this shape.
 */
export type ProjectFormValues = CreateProjectProps;

interface ProjectFormProps {
  projectForm: UseFormReturn<ProjectFormValues>;
  children?: React.ReactNode;
  isViewOnly?: boolean;
  onFormSubmit?: SubmitHandler<ProjectFormValues>;
  /**
   * Associates the form with a submit button rendered outside it (in the page
   * header via `Page`'s `actions`). That button carries `type="submit"` and the
   * same `form={id}`, so it submits this form from outside its subtree.
   */
  id?: string;
}

export function ProjectForm({
  projectForm,
  onFormSubmit = () => {},
  children,
  isViewOnly = false,
  id,
}: ProjectFormProps): React.JSX.Element {
  const { t } = useLingui();

  const [
    isDeleteDefaultLanguageDialogOpen,
    setIsDeleteDefaultLanguageDialogOpen,
  ] = useState(false);
  // Removing a language is a major, irreversible change: Core writes the new
  // settings without checking content, so every translation stored in that
  // language is orphaned in place. Confirm before staging it.
  // See node_modules/@elek-io/core/docs/releases.md.
  const [languagePendingRemoval, setLanguagePendingRemoval] =
    useState<SupportedLanguage | null>(null);

  function removeLanguage(language: SupportedLanguage): void {
    projectForm.setValue(
      'settings.language.supported',
      projectForm
        .watch('settings.language.supported')
        .filter((value) => value !== language),
      { shouldValidate: true, shouldDirty: true }
    );
  }
  const supportedLanguages = supportedLanguageSchema.options.map((option) => {
    return {
      value: option,
      label: option,
    };
  });

  return (
    <>
      <AppForm
        form={projectForm}
        onSubmit={onFormSubmit}
        id={id}
        mode={isViewOnly ? 'view' : 'edit'}
      >
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-12 gap-6">
            <AppField
              form={projectForm}
              name="name"
              label={<Trans>Project name</Trans>}
              required
              className="col-span-12"
            >
              {({ field, controlProps }) => (
                <TextControl field={field} type="text" {...controlProps} />
              )}
            </AppField>

            <AppField
              form={projectForm}
              name="description"
              label={<Trans>Project description</Trans>}
              required
              className="col-span-12"
            >
              {({ field, controlProps }) => (
                <TextareaControl field={field} {...controlProps} />
              )}
            </AppField>
          </div>
        </div>

        <PageSection
          title={t`Language`}
          description={t`Settings related to the languages used in this Project`}
        >
          <div className="grid grid-cols-12 gap-6">
            <AppField
              form={projectForm}
              name="settings.language.supported"
              label={<Trans>Supported</Trans>}
              required
              description={
                <Trans>
                  Select which languages this Projects content has to be
                  translated into. Adding one means every existing Collection
                  and Entry needs a translation for it before it can be saved
                  again, and removing one orphans the content already translated
                  into it.
                </Trans>
              }
              className="col-span-6"
            >
              {({ field, controlProps }) => (
                <div {...controlProps}>
                  <ul className="flex flex-wrap">
                    {field.value.map((language) => {
                      return (
                        <li key={language} className="mr-2 mb-2">
                          <Chip className="py-0 pr-0">
                            {language}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="ml-4 rounded-full"
                              onClick={() => {
                                if (
                                  language ===
                                  projectForm.watch('settings.language.default')
                                ) {
                                  setIsDeleteDefaultLanguageDialogOpen(true);
                                } else {
                                  setLanguagePendingRemoval(language);
                                }
                              }}
                            >
                              <XIcon className="size-4" />
                              <span className="sr-only">
                                <Trans>Remove {language}</Trans>
                              </span>
                            </Button>
                          </Chip>
                        </li>
                      );
                    })}
                  </ul>
                  {isViewOnly ? null : (
                    <Combobox<SupportedLanguage>
                      items={supportedLanguageSchema.options.filter(
                        (language) => field.value.includes(language) === false
                      )}
                      // The picker adds to the list above rather than holding a
                      // selection of its own, so its value stays empty and the
                      // chosen language leaves the items.
                      value={null}
                      onValueChange={(language) => {
                        if (language === null) {
                          return;
                        }
                        projectForm.setValue(
                          'settings.language.supported',
                          [...field.value, language],
                          { shouldValidate: true, shouldDirty: true }
                        );
                      }}
                    >
                      <ComboboxTrigger
                        // The trigger carries the combobox role, whose name is
                        // never its own text, so it says what it shows.
                        aria-label={t`Add language`}
                        render={<Button variant="outline" Icon={Plus} />}
                      >
                        <Trans>Add language</Trans>
                      </ComboboxTrigger>
                      <ComboboxContent>
                        <ComboboxInput
                          placeholder={t`Search languages`}
                          showTrigger={false}
                        />
                        <ComboboxEmpty>
                          <Trans>No languages found.</Trans>
                        </ComboboxEmpty>
                        <ComboboxList>
                          {(language: SupportedLanguage) => (
                            <ComboboxItem key={language} value={language}>
                              {language}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  )}
                </div>
              )}
            </AppField>

            <AppField
              // Keyed on the supported languages, so the select unmounts and
              // remounts whenever they change: it clears its own state when its
              // options do.
              key={projectForm.watch('settings.language.supported').join(',')}
              form={projectForm}
              name="settings.language.default"
              label={<Trans>Default</Trans>}
              required
              description={
                <Trans>
                  The default language of this Project. Needs to be one of the
                  supported languages.
                </Trans>
              }
              className="col-span-6"
            >
              {({ field, controlProps, disabled }) => {
                const availableOptions = supportedLanguages.filter((language) =>
                  projectForm
                    .watch('settings.language.supported')
                    .includes(language.value)
                );

                return (
                  <Select
                    items={Object.fromEntries(
                      availableOptions.map((option) => [
                        option.value,
                        option.label,
                      ])
                    )}
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={disabled}
                  >
                    <SelectTrigger {...controlProps}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableOptions.map((option) => {
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                );
              }}
            </AppField>
          </div>

          <AlertDialog
            open={languagePendingRemoval !== null}
            onOpenChange={(open) => {
              if (open === false) {
                setLanguagePendingRemoval(null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans>
                    Remove {languagePendingRemoval} from this Project?
                  </Trans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans>
                    Any content already translated into {languagePendingRemoval}{' '}
                    stays in the Collection and Entry files but is no longer
                    reachable, and saving does not remove it for you. This is a
                    breaking change for anything consuming this Project&apos;s
                    content. You can still discard it by leaving without saving.
                  </Trans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Trans>Cancel</Trans>
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (languagePendingRemoval !== null) {
                      removeLanguage(languagePendingRemoval);
                    }
                    setLanguagePendingRemoval(null);
                  }}
                >
                  <Trans>Remove language</Trans>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog
            open={isDeleteDefaultLanguageDialogOpen}
            onOpenChange={setIsDeleteDefaultLanguageDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  <Trans>Deleting the default language</Trans>
                </DialogTitle>
                <DialogDescription>
                  <Trans>
                    The default language can&apos;t be deleted. Please select
                    another language as the default and then delete this
                    language.
                  </Trans>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="secondary" />}
                >
                  <Trans>Ok</Trans>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </PageSection>
      </AppForm>
      {children}
    </>
  );
}
