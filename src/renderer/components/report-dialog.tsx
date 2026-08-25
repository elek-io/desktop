import { zodResolver } from '@hookform/resolvers/zod';
import { version as desktopVersion } from '@root/package.json';
import { parseIpcError } from '@root/src/shared/ipcError';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ExternalLink, Send } from 'lucide-react';
import { useEffect, useId, useState, type ReactElement } from 'react';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
  useForm,
} from 'react-hook-form';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@renderer/components/ui/alert';
import {
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { Button } from '@renderer/components/ui/button';
import { ButtonGroup } from '@renderer/components/ui/button-group';
import {
  Dialog,
  DialogBody,
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
  FormToggleField,
} from '@renderer/components/ui/form';
import { useAppMutation } from '@renderer/hooks/useAppMutation';
import { describeCoreError } from '@renderer/lib/coreErrorText';
import { queryOptions } from '@renderer/queries';

import {
  cloudUserSchema,
  createBugReportSchema,
  createFeedbackReportSchema,
  createReportBaseSchema,
  localUserSchema,
  z,
  type CoreErrorType,
  type CreateReportBase,
  type CreateReportProps,
  type User,
} from '@elek-io/core';

const GITHUB_ISSUES_URL = 'https://github.com/elek-io/desktop/issues';

/**
 * Read off the schema rather than hand-copied, so a cap that changes in Core
 * cannot drift from the value used to trim a prefilled field. A field with no
 * upper bound gives `null`, and `slice(0, undefined)` keeps the whole string.
 */
const MESSAGE_MAX_LENGTH =
  createReportBaseSchema.shape.message.maxLength ?? undefined;

export type ReportMode = 'bug' | 'feedback';

export interface ReportPrefill {
  message?: string;
}

/**
 * Describes the application the report was written in, which is the one part of
 * a report Core cannot know. Core names the block `desktop` and exports no type
 * for it on its own, so it is read off the schema it belongs to.
 */
type ReportDesktop = CreateReportBase['desktop'];

function describeDesktop(): ReportDesktop {
  return {
    version: desktopVersion,
    runtime: {
      electron: window.ipc.electron.process.versions['electron'] ?? 'unknown',
      chrome: window.ipc.electron.process.versions['chrome'] ?? 'unknown',
      node: window.ipc.electron.process.versions['node'] ?? 'unknown',
    },
  };
}

/**
 * The contact block as the form holds it, before it becomes Core's `user`.
 *
 * Core takes a whole User or `null`, which is not a shape two text inputs can
 * bind to before a User exists. So the form keeps whatever User it was
 * prefilled with, makes only the two answerable parts editable, and folds an
 * untouched block back to `null` on the way out. Everything else rides along
 * unrendered: the kind of User and their account decide each other, and neither
 * is a thing a report may change.
 *
 * Both halves are nullable here because the typed field wrappers hand back
 * `null` for an emptied input, and because a first run has neither. Half of a
 * contact reports itself instead of silently dropping the other half, since a
 * report nobody can answer is worth much less than one they can.
 */
const contactOverrides = {
  name: localUserSchema.shape.name.nullable(),
  email: localUserSchema.shape.email.nullable(),
};

const reportContactSchema = z
  .discriminatedUnion('userType', [
    localUserSchema.extend(contactOverrides),
    cloudUserSchema.extend(contactOverrides),
  ])
  .superRefine((contact, ctx) => {
    if (contact.name !== null && contact.email === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Add an email, or clear your name to send this anonymously.',
      });
    }
    if (contact.email !== null && contact.name === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Add a name, or clear the email to send this anonymously.',
      });
    }
  })
  .transform((contact): CreateReportBase['user'] => {
    const { name, email } = contact;

    return name === null || email === null ? null : { ...contact, name, email };
  });

type ReportContact = z.input<typeof reportContactSchema>;

/**
 * Core's `message` with copy for the one failure it cannot phrase.
 *
 * The typed field wrappers transform an emptied input to `null` (see
 * contributing/renderer/forms.md), so somebody who types into the field and
 * then clears it would read zod's raw "expected string, received null" instead
 * of something a person can act on. Piping into Core's own schema names that
 * one case without copying the length bounds out of it.
 */
const reportMessageSchema = z
  .string({ error: 'Tell us what happened, in a sentence or two.' })
  .pipe(createReportBaseSchema.shape.message);

const bugReportFormSchema = createBugReportSchema.extend({
  message: reportMessageSchema,
  user: reportContactSchema,
});

const feedbackReportFormSchema = createFeedbackReportSchema.extend({
  message: reportMessageSchema,
  user: reportContactSchema,
});

/**
 * Reads the current User straight out of the query cache instead of through
 * `useUser`, because this dialog also renders inside the root error boundary,
 * which sits outside `UserProvider`. Reading the cache rather than fetching is
 * deliberate too: `useQueryNoError` carries `throwOnError: true`, and a query
 * that threw while the boundary was already rendering an error would escape it.
 *
 * A machine with no User yet gets an empty local contact to type into. `en` is
 * the only language elek.io Desktop speaks today, and it is what the profile
 * form defaults to as well.
 */
function useCachedContact(): ReportContact {
  const queryClient = useQueryClient();
  const user = queryClient.getQueryData<User | null>(
    queryOptions.user.get().queryKey
  );

  if (!user) {
    return {
      userType: 'local',
      language: 'en',
      id: null,
      name: null,
      email: null,
    };
  }

  return { ...user, name: user.name, email: user.email };
}

/** Copy for a failed report, keyed by CoreError type. */
const reportErrorDescriptions: Partial<Record<CoreErrorType, string>> = {
  PreconditionFailed:
    'We could not reach elek.io Cloud. Your text is still here, so you can try again in a moment.',
  RateLimited:
    'Too many reports were sent from here recently. Your text is still here, so you can try again in a few minutes.',
  BadRequest:
    'elek.io Cloud rejected this report. Shortening it, or sending it without the logs, usually helps.',
};

const reportErrorFallback =
  'The report could not be sent. Your text is still here, so you can try again.';

/**
 * Sending a report handles **every** `CoreError` type in place, which is the one
 * deliberate departure from the usual recipe in contributing/error-handling.md.
 * Two reasons, and the second is the load bearing one:
 *
 * - The in-place surface is not built for one specific reason. It is a generic
 *   "could not send this report" alert driven by `describeCoreError`, which has
 *   copy for every type, so an unexpected type still reads sensibly. Showing an
 *   unexpected failure through a dialog meant for one reason is what the usual
 *   rule exists to prevent, and that does not apply here.
 * - One of the two mount points is inside the root error boundary's own
 *   fallback. React cannot catch an error thrown there with the same boundary,
 *   so it escapes to TanStack Router's global catch boundary, which replaces the
 *   crash screen with its bare fallback and takes the report the user just wrote
 *   with it. A mutation that can be mounted inside a boundary's fallback must
 *   not depend on that boundary.
 *
 * Exhaustive over `CoreErrorType`, so a new type in Core is a compile error here
 * rather than a silent escalation. What this does not cover is an error carrying
 * no type at all (a bug in our own IPC plumbing rather than a Core failure),
 * which `useAppMutation` still routes to the boundary by design.
 */
function reportErrorHandlers(
  onFailure: (error: unknown) => void
): Record<CoreErrorType, (error: unknown) => void> {
  return {
    NotFound: onFailure,
    BadRequest: onFailure,
    Unauthorized: onFailure,
    Conflict: onFailure,
    PreconditionFailed: onFailure,
    UpgradeFailed: onFailure,
    VersionSkew: onFailure,
    RateLimited: onFailure,
    Internal: onFailure,
  };
}

/**
 * The send half both forms share: the mutation, the handled-error set and the
 * held failure. Shared rather than written twice, because the handled map is
 * what keeps a failed send from destroying the user's text, and a set that
 * drifted between the two forms would only break one of them.
 */
function useSendReport(onSent: () => void): {
  send: SubmitHandler<CreateReportProps>;
  sendError: unknown;
} {
  const [sendError, setSendError] = useState<unknown>(null);
  const { mutateAsync: createReport, handleError } = useAppMutation(
    queryOptions.cloud.reports.create,
    { handled: reportErrorHandlers(setSendError) }
  );

  const send: SubmitHandler<CreateReportProps> = async (report) => {
    setSendError(null);
    try {
      await createReport(report);
      onSent();
    } catch (error) {
      handleError(error);

      // Handling a type in place suppresses the mutation wrapper's toast and
      // log. Every type is handled here, so without this the failure would
      // never be written down at all. What the user wrote is deliberately not
      // part of it, the same way Core keeps a report out of its own log files.
      const { type, message, stack } = parseIpcError(error);
      void window.ipc.core.logger
        .error({
          source: 'desktop',
          message: `Failed to send a report: ${message}`,
          meta: { type, error: { message, stack } },
        })
        .catch(() => undefined);
    }
  };

  return { send, sendError };
}

/**
 * A failed send that we can explain stays inside the dialog, so the user does
 * not lose what they wrote.
 */
function ReportError({ error }: { error: unknown }): ReactElement | null {
  if (error === null) {
    return null;
  }

  const { type } = parseIpcError(error);

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Could not send this report</AlertTitle>
      <AlertDescription>
        {describeCoreError(type, reportErrorDescriptions, reportErrorFallback)}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The contact block, shared by both forms. Generic over the form shape, so only
 * the field names are cast rather than the whole form. Same approach as
 * `AssetForm`, see contributing/renderer/forms.md.
 */
function ContactFields<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  purpose,
}: {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  purpose: string;
}): ReactElement {
  return (
    <>
      <FormField
        control={form.control}
        name={'user.name' as FieldPath<TFieldValues>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <FormInputField field={field} type="text" />
            </FormControl>
            <FormDescription>Who this {purpose} is from.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={'user.email' as FieldPath<TFieldValues>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <FormInputField field={field} type="email" />
            </FormControl>
            <FormDescription>
              Only so we can come back to you about this {purpose}. Both are
              prefilled from your local User and both are yours to change. Leave
              them empty to send this anonymously.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

/**
 * The detached submit footer, shared by both forms. Generic over the form shape
 * so each concrete form is assignable without a cast.
 */
function ReportFooter<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  formId,
  label,
}: {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  formId: string;
  label: string;
}): ReactElement {
  return (
    <FormActions form={form} id={formId}>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <SubmitButton Icon={Send}>{label}</SubmitButton>
      </DialogFooter>
    </FormActions>
  );
}

function BugReportForm({
  prefill,
  defaultIncludeLogs,
  onSent,
}: {
  prefill: ReportPrefill;
  defaultIncludeLogs: boolean;
  onSent: () => void;
}): ReactElement {
  const formId = useId();
  const contact = useCachedContact();
  const { send, sendError } = useSendReport(onSent);

  const form = useForm({
    resolver: zodResolver(bugReportFormSchema),
    defaultValues: {
      type: 'bug' as const,
      message: prefill.message?.slice(0, MESSAGE_MAX_LENGTH) ?? '',
      user: contact,
      includeLogs: defaultIncludeLogs,
      desktop: describeDesktop(),
    },
  });

  return (
    <>
      <AppForm
        form={form}
        onSubmit={send}
        id={formId}
        className="flex min-h-0 flex-col"
        fieldsetClassName="flex min-h-0 flex-1 flex-col"
      >
        <DialogBody>
          <ReportError error={sendError} />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>What went wrong?</FormLabel>
                <FormControl>
                  <FormTextareaField field={field} rows={8} />
                </FormControl>
                <FormDescription>
                  Tell us what happened and what you expected instead. If you
                  can, what you did just before it happened is usually what lets
                  us reproduce it.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <ContactFields form={form} purpose="report" />

          <FormField
            control={form.control}
            name="includeLogs"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-3">
                  <FormControl>
                    <FormToggleField field={field} />
                  </FormControl>
                  {/*
                    isRequired only suppresses FormLabel's " - optional" suffix.
                    On a switch that suffix means nothing, since it always has a
                    value, and it would land in the control's accessible name
                    ("Also send my logs - optional, switch"). This is the one
                    label carrying the user's consent to send data, so it has to
                    read exactly as written.
                  */}
                  <FormLabel isRequired>Also send my logs</FormLabel>
                </div>
                <FormDescription>
                  Sends what elek.io Desktop recorded on this machine in the
                  last 24 hours. That includes the ids of your Projects,
                  Collections and Entries, the files they live in and the
                  actions you took, but never the content you wrote or the names
                  you gave them. It is the single most useful thing for finding
                  a bug.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <p className="text-sm text-muted-foreground">
            Prefer to report this in the open?{' '}
            <Button
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => window.open(GITHUB_ISSUES_URL, '_blank')}
            >
              Open an issue on GitHub
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </p>
        </DialogBody>
      </AppForm>

      <ReportFooter form={form} formId={formId} label="Send report" />
    </>
  );
}

function FeedbackForm({ onSent }: { onSent: () => void }): ReactElement {
  const formId = useId();
  const contact = useCachedContact();
  const { send, sendError } = useSendReport(onSent);

  const form = useForm({
    resolver: zodResolver(feedbackReportFormSchema),
    defaultValues: {
      type: 'feedback' as const,
      message: '',
      user: contact,
      desktop: describeDesktop(),
    },
  });

  return (
    <>
      <AppForm
        form={form}
        onSubmit={send}
        id={formId}
        className="flex min-h-0 flex-col"
        fieldsetClassName="flex min-h-0 flex-1 flex-col"
      >
        <DialogBody>
          <ReportError error={sendError} />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel isRequired>
                  What would you like to tell us?
                </FormLabel>
                <FormControl>
                  <FormTextareaField field={field} rows={8} />
                </FormControl>
                <FormDescription>
                  What is missing, what got in your way, or what you would like
                  to see next.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <ContactFields form={form} purpose="feedback" />
        </DialogBody>
      </AppForm>

      <ReportFooter form={form} formId={formId} label="Send feedback" />
    </>
  );
}

export interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which form to open on. Defaults to the bug report. */
  defaultMode?: ReportMode;
  /** Seeds the bug form, so a crash can hand over what it already knows. */
  prefill?: ReportPrefill;
  /**
   * Whether "Also send my logs" starts on. Off from the header, on from the
   * error boundary, where the logs are the point.
   */
  defaultIncludeLogs?: boolean;
}

/**
 * The one place a bug report or a piece of feedback is written and sent.
 *
 * Two independent forms behind one dialog rather than one form with optional
 * halves: a bug report and a suggestion ask for genuinely different things, and
 * a single schema covering both would validate neither properly.
 *
 * This is the only thing in the app that sends anything off the machine, and it
 * only ever does so because the user typed it and pressed send. See
 * contributing/error-handling.md.
 */
export function ReportDialog({
  open,
  onOpenChange,
  defaultMode = 'bug',
  prefill = {},
  defaultIncludeLogs = false,
}: ReportDialogProps): ReactElement {
  const [mode, setMode] = useState<ReportMode>(defaultMode);

  // Reset on open, in an effect rather than from onOpenChange. Radix calls
  // onOpenChange only from its own internal setter (a trigger, the close button,
  // Escape, an overlay click), and both entry points open this dialog by
  // flipping the `open` prop instead, so an onOpenChange(true) never arrives.
  // Without this, switching to feedback and reopening would still show feedback.
  useEffect(() => {
    if (open) {
      setMode(defaultMode);
    }
  }, [open, defaultMode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'bug' ? 'Report a bug' : 'Share feedback'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'bug'
              ? 'Nothing is sent to us automatically, so this is how we find out. Tell us what broke.'
              : 'Tell us what you think of elek.io Desktop. We read every one of these.'}
          </DialogDescription>
          <ButtonGroup className="mt-2">
            <Button
              variant={mode === 'bug' ? 'default' : 'outline'}
              aria-pressed={mode === 'bug'}
              onClick={() => setMode('bug')}
            >
              Report a bug
            </Button>
            <Button
              variant={mode === 'feedback' ? 'default' : 'outline'}
              aria-pressed={mode === 'feedback'}
              onClick={() => setMode('feedback')}
            >
              Share feedback
            </Button>
          </ButtonGroup>
        </DialogHeader>

        {/*
          Keyed so switching mode mounts a fresh form rather than reusing the
          other one's state. Each mode owns its own useForm.
        */}
        {mode === 'bug' ? (
          <BugReportForm
            key="bug"
            prefill={prefill}
            defaultIncludeLogs={defaultIncludeLogs}
            onSent={() => onOpenChange(false)}
          />
        ) : (
          <FeedbackForm key="feedback" onSent={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
