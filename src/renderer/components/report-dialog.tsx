import { zodResolver } from '@hookform/resolvers/zod';
import { i18n, type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { version as desktopVersion } from '@root/package.json';
import { parseIpcError } from '@root/src/shared/ipcError';
import { errorLogAttributes } from '@root/src/shared/logError';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ExternalLink, Send } from 'lucide-react';
import {
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  type FieldPath,
  type FieldValues,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@renderer/components/ui/alert';
import {
  AppField,
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
  SwitchControl,
  TextControl,
  TextareaControl,
} from '@renderer/components/ui/field-controls';
import { useAppForm } from '@renderer/hooks/useAppForm';
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
} from '@elek-io/core';

const GITHUB_ISSUES_URL = 'https://github.com/elek-io/desktop/issues';

export type ReportMode = 'bug' | 'feedback';

/**
 * Describes the application the report was written in, which is the one part of
 * a report Core cannot know. Core names the block `desktop` and exports no type
 * for it on its own, so it is read off the schema it belongs to.
 */
type ReportDesktop = CreateReportBase['desktop'];

function describeDesktop(): ReportDesktop {
  // A runtime version Electron did not report. It travels to us in a report
  // body rather than onto a screen, so it stays out of the catalog.
  /* eslint-disable lingui/no-unlocalized-strings */
  return {
    version: desktopVersion,
    runtime: {
      electron: window.ipc.electron.process.versions['electron'] ?? 'unknown',
      chrome: window.ipc.electron.process.versions['chrome'] ?? 'unknown',
      node: window.ipc.electron.process.versions['node'] ?? 'unknown',
    },
  };
  /* eslint-enable lingui/no-unlocalized-strings */
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
        message: i18n._(
          msg`Add an email, or clear your name to send this anonymously.`
        ),
      });
    }
    if (contact.email !== null && contact.name === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['name'],
        message: i18n._(
          msg`Add a name, or clear the email to send this anonymously.`
        ),
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
  .string({
    // A function rather than a string, so the catalog is read when the form is
    // validated rather than when this module loads.
    error: () => i18n._(msg`Tell us what happened, in a sentence or two.`),
  })
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
  const user = queryClient.getQueryData(queryOptions.user.get().queryKey);

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

/** Copy for a failed feedback send, keyed by CoreError type. */
const feedbackErrorDescriptions: Partial<
  Record<CoreErrorType, MessageDescriptor>
> = {
  PreconditionFailed: msg`We could not reach elek.io Cloud. Your text is still here, so you can try again in a moment.`,
  RateLimited: msg`Too many reports were sent from here recently. Your text is still here, so you can try again in a few minutes.`,
  BadRequest: msg`elek.io Cloud rejected this report. Shortening it usually helps.`,
};

/** The bug form's copy, which differs only where the logs can be left out. */
const bugErrorDescriptions: Partial<Record<CoreErrorType, MessageDescriptor>> =
  {
    ...feedbackErrorDescriptions,
    BadRequest: msg`elek.io Cloud rejected this report. Shortening it, or sending it without the logs, usually helps.`,
  };

const reportErrorFallback = msg`The report could not be sent. Your text is still here, so you can try again.`;

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
      const { message } = parseIpcError(error);
      void window.ipc.core.logger
        .error({
          source: 'desktop',
          message: `Failed to send a report: ${message}`,
          meta: errorLogAttributes(error),
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
function ReportError({
  error,
  descriptions,
}: {
  error: unknown;
  descriptions: Partial<Record<CoreErrorType, MessageDescriptor>>;
}): ReactElement | null {
  if (error === null) {
    return null;
  }

  const { type } = parseIpcError(error);

  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>
        <Trans>Could not send this report</Trans>
      </AlertTitle>
      <AlertDescription>
        {describeCoreError(type, descriptions, reportErrorFallback)}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The contact block, shared by both forms. Generic over the form shape, and the
 * caller passes the two field paths in where its form type is concrete, so they
 * are checked without a cast. See contributing/renderer/forms.md.
 *
 * Each caller passes its two descriptions as whole sentences, because the one
 * word that differs between them (a report, a piece of feedback) cannot be
 * translated on its own, see contributing/renderer/internationalization.md.
 */
function ContactFields<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  nameField,
  emailField,
  nameDescription,
  emailDescription,
}: {
  form: UseFormReturn<TFieldValues, unknown, TTransformedValues>;
  nameField: NoInfer<FieldPath<TFieldValues>>;
  emailField: NoInfer<FieldPath<TFieldValues>>;
  nameDescription: ReactNode;
  emailDescription: ReactNode;
}): ReactElement {
  return (
    <>
      <AppField
        form={form}
        name={nameField}
        label={<Trans>Name</Trans>}
        description={nameDescription}
      >
        {({ field, controlProps }) => (
          <TextControl field={field} type="text" {...controlProps} />
        )}
      </AppField>

      <AppField
        form={form}
        name={emailField}
        label={<Trans>Email</Trans>}
        description={emailDescription}
      >
        {({ field, controlProps }) => (
          <TextControl field={field} type="email" {...controlProps} />
        )}
      </AppField>
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
        <DialogClose render={<Button variant="secondary" />}>
          <Trans>Cancel</Trans>
        </DialogClose>
        <SubmitButton Icon={Send}>{label}</SubmitButton>
      </DialogFooter>
    </FormActions>
  );
}

function BugReportForm({
  defaultHasLogConsent,
  onSent,
}: {
  defaultHasLogConsent: boolean;
  onSent: () => void;
}): ReactElement {
  const { t } = useLingui();

  const formId = useId();
  const contact = useCachedContact();
  const { send, sendError } = useSendReport(onSent);

  const form = useAppForm({
    resolver: zodResolver(bugReportFormSchema),
    defaultValues: {
      type: 'bug' as const,
      message: '',
      user: contact,
      hasLogConsent: defaultHasLogConsent,
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
          <ReportError error={sendError} descriptions={bugErrorDescriptions} />

          <AppField
            form={form}
            name="message"
            label={<Trans>What went wrong?</Trans>}
            required
            description={
              <Trans>
                What you did just before it happened, roughly when, and what you
                expected instead. That is usually what lets us find it in the
                logs and reproduce it.
              </Trans>
            }
          >
            {({ field, controlProps }) => (
              <TextareaControl field={field} rows={8} {...controlProps} />
            )}
          </AppField>

          <ContactFields
            form={form}
            nameField="user.name"
            emailField="user.email"
            nameDescription={<Trans>Who this report is from.</Trans>}
            emailDescription={
              <Trans>
                Only so we can come back to you about this report. Both are
                yours to change. Leave them empty to send this anonymously.
              </Trans>
            }
          />

          {/*
            `required` only suppresses the label's " - optional" suffix. On a
            switch that suffix means nothing, since it always has a value, and
            it would land in the control's accessible name ("Also send my logs
            - optional, switch"). This is the one label carrying the user's
            consent to send data, so it has to read exactly as written.
          */}
          <AppField
            form={form}
            name="hasLogConsent"
            label={<Trans>Also send my logs</Trans>}
            required
            orientation="horizontal"
            description={
              <Trans>
                Sends what elek.io Desktop recorded on this machine in the last
                24 hours. That includes the ids of your Projects, Collections
                and Entries, the files they live in and the actions you took,
                but never the content you wrote or the names you gave them. It
                is the single most useful thing for finding a bug.
              </Trans>
            }
          >
            {({ field, controlProps }) => (
              <SwitchControl field={field} {...controlProps} />
            )}
          </AppField>

          <p className="text-sm text-muted-foreground">
            <Trans>Prefer to report this in the open?</Trans>{' '}
            <Button
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => window.open(GITHUB_ISSUES_URL, '_blank')}
            >
              <Trans>Open an issue on GitHub</Trans>
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </p>
        </DialogBody>
      </AppForm>

      <ReportFooter form={form} formId={formId} label={t`Send report`} />
    </>
  );
}

function FeedbackForm({ onSent }: { onSent: () => void }): ReactElement {
  const { t } = useLingui();

  const formId = useId();
  const contact = useCachedContact();
  const { send, sendError } = useSendReport(onSent);

  const form = useAppForm({
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
          <ReportError
            error={sendError}
            descriptions={feedbackErrorDescriptions}
          />

          <AppField
            form={form}
            name="message"
            label={<Trans>What would you like to tell us?</Trans>}
            required
            description={
              <Trans>
                What is missing, what got in your way, or what you would like to
                see next.
              </Trans>
            }
          >
            {({ field, controlProps }) => (
              <TextareaControl field={field} rows={8} {...controlProps} />
            )}
          </AppField>

          <ContactFields
            form={form}
            nameField="user.name"
            emailField="user.email"
            nameDescription={<Trans>Who this feedback is from.</Trans>}
            emailDescription={
              <Trans>
                Only so we can come back to you about this feedback. Both are
                yours to change. Leave them empty to send this anonymously.
              </Trans>
            }
          />
        </DialogBody>
      </AppForm>

      <ReportFooter form={form} formId={formId} label={t`Send feedback`} />
    </>
  );
}

export interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which form to open on. Defaults to the bug report. */
  defaultMode?: ReportMode;
  /**
   * Whether "Also send my logs" starts on. Off from the header, on from the
   * error boundary, where the logs are the point.
   */
  defaultHasLogConsent?: boolean;
}

/**
 * The one place a bug report or a piece of feedback is written and sent.
 *
 * Two independent forms behind one dialog rather than one form with optional
 * halves: a bug report and a suggestion ask for genuinely different things, and
 * a single schema covering both would validate neither properly.
 *
 * This is the only thing in the app that sends anything to elek.io, and it only
 * ever does so because the user typed it and pressed send. See
 * contributing/error-handling.md.
 */
export function ReportDialog({
  open,
  onOpenChange,
  defaultMode = 'bug',
  defaultHasLogConsent = false,
}: ReportDialogProps): ReactElement {
  const [mode, setMode] = useState<ReportMode>(defaultMode);

  // Reset on open, in an effect rather than from onOpenChange. The dialog calls
  // onOpenChange only from its own parts (a trigger, the close button, Escape,
  // an overlay click), and both entry points open this dialog by flipping the
  // `open` prop instead, so an onOpenChange(true) never arrives.
  // Without this, switching to feedback and reopening would still show feedback.
  useEffect(() => {
    if (open) {
      setMode(defaultMode);
    }
  }, [open, defaultMode]);

  return (
    // Only the X and Cancel close it. A stray Escape or a click beside the
    // dialog would otherwise throw away what the user wrote, which is the one
    // thing this dialog exists to keep. `disablePointerDismissal` turns away a
    // press outside and a focus that leaves, and the Escape key is canceled by
    // its reason.
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(nextOpen, eventDetails) => {
        if (eventDetails.reason === 'escape-key') {
          eventDetails.cancel();
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'bug' ? (
              <Trans>Report a bug</Trans>
            ) : (
              <Trans>Share feedback</Trans>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === 'bug' ? (
              <Trans>
                Nothing is sent to us automatically, so this is how we find out.
                Tell us what broke.
              </Trans>
            ) : (
              <Trans>
                Tell us what you think of elek.io Desktop. We read every one of
                these.
              </Trans>
            )}
          </DialogDescription>
          {/* Which of the two forms is shown, not a word. */}
          {/* eslint-disable lingui/no-unlocalized-strings */}
          <ButtonGroup className="mt-2">
            <Button
              variant="outline"
              aria-pressed={mode === 'bug'}
              onClick={() => setMode('bug')}
            >
              <Trans>Report a bug</Trans>
            </Button>
            <Button
              variant="outline"
              aria-pressed={mode === 'feedback'}
              onClick={() => setMode('feedback')}
            >
              <Trans>Share feedback</Trans>
            </Button>
          </ButtonGroup>
          {/* eslint-enable lingui/no-unlocalized-strings */}
        </DialogHeader>

        {/*
          Keyed so switching mode mounts a fresh form rather than reusing the
          other one's state. Each mode owns its own useForm.
        */}
        {mode === 'bug' ? (
          <BugReportForm
            key="bug"
            defaultHasLogConsent={defaultHasLogConsent}
            onSent={() => onOpenChange(false)}
          />
        ) : (
          <FeedbackForm key="feedback" onSent={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
