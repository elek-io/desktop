import { Cross2Icon } from '@radix-ui/react-icons';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import {
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

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
import { AppForm } from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import { Chip } from '@renderer/components/ui/chip';
import {
  CommandInput,
  CommandEmpty,
  CommandGroup,
  CommandList,
  CommandItem,
  Command,
} from '@renderer/components/ui/command';
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
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  FormTextareaField,
} from '@renderer/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@renderer/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';

import {
  supportedLanguageSchema,
  type SupportedLanguage,
  type UpdateProjectProps,
} from '@elek-io/core';

interface ProjectFormProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
> {
  projectForm: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  children?: React.ReactNode;
  isViewOnly?: boolean;
  onFormSubmit?: SubmitHandler<TTransformedValues>;
  /**
   * Associates the form with a submit button rendered outside it (in the page
   * header via `Page`'s `actions`). That button carries `type="submit"` and the
   * same `form={id}`, so it submits this form from outside its subtree.
   */
  id?: string;
}

export function ProjectForm<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  projectForm: genericForm,
  onFormSubmit = () => {},
  children,
  isViewOnly = false,
  id,
}: ProjectFormProps<TFieldValues, TTransformedValues>): React.JSX.Element {
  // The concrete fields use literal paths RHF cannot resolve for a generic T, so
  // view the form as UpdateProjectProps for those. This is the documented
  // exception to the form-cast guardrail, scoped to the cast line below so the
  // ban stays global for the rest of the file.
  // @todo Retire it (e.g. a per-mode non-generic component) and drop the suppression.
  const projectForm =
    // eslint-disable-next-line no-restricted-syntax -- documented whole-form cast
    genericForm as unknown as UseFormReturn<UpdateProjectProps>;
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
        form={genericForm}
        onSubmit={onFormSubmit}
        id={id}
        mode={isViewOnly ? 'view' : 'edit'}
      >
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-12 gap-6">
            <FormField
              control={projectForm.control}
              name="name"
              render={({ field }) => (
                <FormItem className="col-span-12">
                  <FormLabel isRequired>Project name</FormLabel>
                  <FormControl>
                    <FormInputField field={field} type="text" />
                  </FormControl>
                  <FormDescription />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={projectForm.control}
              name="description"
              render={({ field }) => (
                <FormItem className="col-span-12">
                  <FormLabel isRequired>Project description</FormLabel>
                  <FormControl>
                    <FormTextareaField field={field} />
                  </FormControl>
                  <FormDescription />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <PageSection
          title="Language"
          description="Settings related to the languages used in this Project"
        >
          <div className="grid grid-cols-12 gap-6">
            <FormField
              control={projectForm.control}
              name="settings.language.supported"
              render={({ field }) => (
                <>
                  <FormItem className="col-span-6">
                    <FormLabel isRequired>Supported</FormLabel>
                    <FormControl>
                      <div>
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
                                    <Cross2Icon className="h-4 w-4" />
                                    <span className="sr-only">
                                      Remove {language}
                                    </span>
                                  </Button>
                                </Chip>
                              </li>
                            );
                          })}
                        </ul>
                        {isViewOnly ? null : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button role="combobox">
                                <Plus className="mr-2 h-4 w-4" />
                                Add language
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0">
                              <Command>
                                <CommandInput placeholder="Search language..." />
                                <CommandEmpty>No framework found.</CommandEmpty>
                                <CommandGroup>
                                  <CommandList>
                                    {supportedLanguages
                                      .filter(
                                        (language) =>
                                          projectForm
                                            .watch(
                                              'settings.language.supported'
                                            )
                                            .includes(language.value) === false
                                      )
                                      .map((language) => (
                                        <CommandItem
                                          key={language.value}
                                          value={language.value}
                                          onSelect={(currentValue) => {
                                            projectForm.setValue(
                                              'settings.language.supported',
                                              [
                                                ...projectForm.watch(
                                                  'settings.language.supported'
                                                ),
                                                currentValue as SupportedLanguage,
                                              ],
                                              {
                                                shouldValidate: true,
                                                shouldDirty: true,
                                              }
                                            );
                                          }}
                                        >
                                          {language.label}
                                        </CommandItem>
                                      ))}
                                  </CommandList>
                                </CommandGroup>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>
                      Select which languages this Projects content has to be
                      translated into. Adding one means every existing
                      Collection and Entry needs a translation for it before it
                      can be saved again, and removing one orphans the content
                      already translated into it.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                </>
              )}
            />

            <FormField
              // Setting the key to force React to completely unmount and remount the entire field whenever the supported languages array changes
              // Radix UI Select seems to clear its internal state when its options change
              key={projectForm.watch('settings.language.supported').join(',')}
              control={projectForm.control}
              name="settings.language.default"
              render={({ field }) => {
                const supported = projectForm.watch(
                  'settings.language.supported'
                );
                const availableOptions = supportedLanguages.filter((language) =>
                  supported.includes(language.value)
                );

                return (
                  <FormItem className="col-span-6">
                    <FormLabel isRequired>Default</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => field.onChange(value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
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
                    <FormDescription>
                      The default language of this Project. Needs to be one of
                      the supported languages.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
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
                  Remove {languagePendingRemoval} from this Project?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Any content already translated into {languagePendingRemoval}{' '}
                  stays in the Collection and Entry files but is no longer
                  reachable, and saving does not remove it for you. This is a
                  breaking change for anything consuming this Project&apos;s
                  content. You can still discard it by leaving without saving.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (languagePendingRemoval !== null) {
                      removeLanguage(languagePendingRemoval);
                    }
                    setLanguagePendingRemoval(null);
                  }}
                >
                  Remove language
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
                <DialogTitle>Deleting the default language</DialogTitle>
                <DialogDescription>
                  The default language can&apos;t be deleted. Please select
                  another language as the default and then delete this language.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Ok
                  </Button>
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
