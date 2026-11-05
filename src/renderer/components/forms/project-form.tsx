import { Trans, useLingui } from '@lingui/react/macro';
import { GitBranch, HardDrive, Plus, XIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { type SubmitHandler, type UseFormReturn } from 'react-hook-form';

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
import { Label } from '@renderer/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@renderer/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { alwaysFilledFieldRules } from '@renderer/lib/fieldRules';
import {
  projectLocationSchema,
  type ProjectFormValues,
  type ProjectLocation,
} from '@renderer/lib/projectForm';
import { cn } from '@renderer/lib/utils';

import { supportedLanguageSchema, type SupportedLanguage } from '@elek-io/core';

/** One option of "Where to keep it": what it is, and what it means. */
function LocationOption({
  value,
  icon: Icon,
  title,
  line,
  disabled,
  children,
}: {
  value: ProjectLocation;
  icon: typeof HardDrive;
  title: React.ReactNode;
  line: React.ReactNode;
  disabled: boolean;
  /** What the option asks for once it is chosen, such as an address. */
  children?: React.ReactNode;
}): React.JSX.Element {
  const id = useId();

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 has-data-checked:border-foreground">
      <RadioGroupItem
        id={id}
        value={value}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={id} className="gap-2">
          <Icon className="size-3 text-muted-foreground" />
          {title}
        </Label>
        <span className="text-small text-muted-foreground">{line}</span>
        {children}
      </div>
    </div>
  );
}

interface ProjectFormProps {
  projectForm: UseFormReturn<ProjectFormValues>;
  /**
   * The Core schema this form checks against, which its fields read their own
   * rules off, so no limit Core sets is written out here.
   */
  schema: unknown;
  children?: React.ReactNode;
  isViewOnly?: boolean;
  /**
   * Whether the form asks where to keep the Project, which only Create Project
   * does: the Project's Settings changes the address on its Sync page instead.
   * It puts the choice in a column of its own beside the Project's fields, as
   * ci draws Create Project.
   */
  asksWhereToKeepIt?: boolean;
  /**
   * Why the form cannot be saved yet, which stands below Save. The same string
   * goes to the `FormActions` that holds the button, see
   * contributing/renderer/forms.md#saves-block.
   */
  blockedBy?: string | undefined;
  onFormSubmit?: SubmitHandler<ProjectFormValues>;
  /**
   * Associates the form with a submit button rendered outside it (in the page
   * header via `Page`'s `actions`). That button carries `type="submit"` and the
   * same `form={id}`, so it submits this form from outside its subtree.
   */
  id?: string;
  /** The page's title, which turns the leave guard on, see `AppForm`. */
  unsavedChangesTitle?: string | undefined;
}

export function ProjectForm({
  projectForm,
  schema,
  onFormSubmit = () => {},
  children,
  isViewOnly = false,
  asksWhereToKeepIt = false,
  blockedBy,
  id,
  unsavedChangesTitle,
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
        schema={schema}
        onSubmit={onFormSubmit}
        id={id}
        mode={isViewOnly ? 'view' : 'edit'}
        blockedBy={blockedBy}
        unsavedChangesTitle={unsavedChangesTitle}
      >
        {/*
          Where to keep it on the left and the Project itself on the right, 48
          px apart, as ci lays Create Project out. Without that choice the
          fields stand in one column, which is what the Project's Settings
          shows.
        */}
        <div
          className={cn(
            'items-start gap-x-12',
            asksWhereToKeepIt && 'grid grid-cols-1 lg:grid-cols-2'
          )}
        >
          {asksWhereToKeepIt ? (
            <AppField
              form={projectForm}
              name="keptOn"
              label={<Trans>Where to keep it</Trans>}
              // One of the two is always chosen, so Required would name a rule
              // nobody can break, see `lib/fieldRules.ts`.
              rules={alwaysFilledFieldRules()}
            >
              {({ field, controlProps, disabled, readOnly }) => (
                <RadioGroup
                  {...controlProps}
                  // A radio group takes no name from the radio buttons inside
                  // it, so it says the field's label.
                  aria-label={t`Where to keep it`}
                  className="gap-2"
                  value={field.value}
                  onValueChange={(value: string) =>
                    field.onChange(projectLocationSchema.parse(value))
                  }
                  ref={field.ref}
                  onBlur={field.onBlur}
                  disabled={disabled || readOnly}
                >
                  <LocationOption
                    value="this-computer"
                    icon={HardDrive}
                    title={<Trans>This computer</Trans>}
                    line={
                      <Trans>
                        Only here. You can set up sync later in its Settings.
                      </Trans>
                    }
                    disabled={disabled || readOnly}
                  />
                  <LocationOption
                    value="git-host"
                    icon={GitBranch}
                    title={<Trans>Another Git host</Trans>}
                    line={
                      <Trans>
                        GitHub, GitLab or any other. Desktop syncs the Project
                        with it.
                      </Trans>
                    }
                    disabled={disabled || readOnly}
                  >
                    {field.value === 'git-host' ? (
                      <AppField
                        form={projectForm}
                        name="remoteOriginUrl"
                        label={<Trans>Address</Trans>}
                        // Core takes the address as a plain string, so its
                        // schema cannot say the field has to hold one once
                        // this option is chosen.
                        required
                        description={
                          <Trans>
                            An empty repository that supports Git LFS.
                          </Trans>
                        }
                        className="mt-2.5"
                      >
                        {({
                          field: addressField,
                          controlProps: addressProps,
                        }) => (
                          <TextControl
                            field={addressField}
                            type="text"
                            className="font-mono"
                            {...addressProps}
                          />
                        )}
                      </AppField>
                    ) : null}
                  </LocationOption>
                </RadioGroup>
              )}
            </AppField>
          ) : null}

          <div className="@container flex flex-col gap-5">
            <AppField
              form={projectForm}
              name="name"
              label={<Trans>Name</Trans>}
            >
              {({ field, controlProps }) => (
                <TextControl field={field} type="text" {...controlProps} />
              )}
            </AppField>

            <AppField
              form={projectForm}
              name="description"
              label={<Trans>Description</Trans>}
              description={
                <Trans>Shown below the name on the Projects page.</Trans>
              }
            >
              {({ field, controlProps }) => (
                <TextareaControl field={field} {...controlProps} />
              )}
            </AppField>

            <div className="grid grid-cols-1 gap-6 @min-[344px]:grid-cols-2">
              <AppField
                form={projectForm}
                name="settings.language.supported"
                label={<Trans>Languages</Trans>}
                // A Project cannot be saved without a language, which is the one
                // thing a list's schema cannot say, see `lib/fieldRules.ts`.
                required
                description={
                  <Trans>
                    Select which languages this Projects content has to be
                    translated into. Adding one means every existing Collection
                    and Entry needs a translation for it before it can be saved
                    again, and removing one orphans the content already
                    translated into it.
                  </Trans>
                }
              >
                {({ field, controlProps, readOnly }) => {
                  // The chosen languages and the picker that adds one are
                  // several controls rather than one, so what the label points
                  // at is their container and not a control. `aria-required` is
                  // dropped for that reason: the rules beside the label say the
                  // field is required, and its `aria-describedby` names them.
                  const { 'aria-required': _dropped, ...groupProps } =
                    controlProps;

                  return (
                    <div {...groupProps}>
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
                                  // Only an input can be read-only on its own, so
                                  // while the form saves the two controls that
                                  // change this Value take no press instead.
                                  disabled={readOnly}
                                  onClick={() => {
                                    if (
                                      language ===
                                      projectForm.watch(
                                        'settings.language.default'
                                      )
                                    ) {
                                      setIsDeleteDefaultLanguageDialogOpen(
                                        true
                                      );
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
                            (language) =>
                              field.value.includes(language) === false
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
                            render={
                              <Button
                                variant="outline"
                                Icon={Plus}
                                disabled={readOnly}
                              />
                            }
                          >
                            <Trans>Add language</Trans>
                          </ComboboxTrigger>
                          <ComboboxContent>
                            {/* The field inside the popup filters the list, and
                        no label stands above it, so it keeps its name inside
                        itself, as every filter does. */}
                            <ComboboxInput
                              name={t`Search languages`}
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
                  );
                }}
              </AppField>

              <AppField
                // Keyed on the supported languages, so the select unmounts and
                // remounts whenever they change: it clears its own state when its
                // options do.
                key={projectForm.watch('settings.language.supported').join(',')}
                form={projectForm}
                name="settings.language.default"
                label={<Trans>Default language</Trans>}
                description={
                  <Trans>
                    The language every other one is translated from. It has to
                    be one of the Project&apos;s languages.
                  </Trans>
                }
              >
                {({ field, controlProps, disabled, readOnly }) => {
                  const availableOptions = supportedLanguages.filter(
                    (language) =>
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
                      // A select has no read-only of its own, so while the form
                      // saves it takes no choice instead.
                      disabled={disabled || readOnly}
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
          </div>
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
                  another language as the default and then delete this language.
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
      </AppForm>
      {children}
    </>
  );
}
