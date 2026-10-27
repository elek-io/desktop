import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useRouter } from '@tanstack/react-router';
import { CircleAlertIcon, LogInIcon, UserPlusIcon } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Page } from '@renderer/components/page';
import {
  AppForm,
  FormActions,
  SubmitButton,
} from '@renderer/components/ui/app-form';
import { Avatar } from '@renderer/components/ui/avatar';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import {
  FormControl,
  FormDescription,
  FormField,
  FormInputField,
  FormItem,
  FormLabel,
  FormMessage,
  FormPasswordField,
} from '@renderer/components/ui/form';
import {
  type CoreErrorHandlers,
  useAppMutation,
} from '@renderer/hooks/useAppMutation';
import { useCloudAccount } from '@renderer/hooks/useCloudAccount';
import { useUser } from '@renderer/hooks/useUser';
import { requiredField } from '@renderer/lib/requiredField';
import { queryOptions } from '@renderer/queries';

import {
  type SignInProps,
  type SignUpProps,
  signInSchema,
  signUpSchema,
  type User,
} from '@elek-io/core';

/**
 * Where an account page was opened from. It decides the breadcrumb and where
 * its links lead: the Projects page, or the First start before a User exists.
 */
export type AccountPageOrigin = 'projects' | 'welcome';

const accountPaths = {
  projects: {
    signIn: '/projects/sign-in',
    createAccount: '/projects/create-account',
  },
  welcome: {
    signIn: '/welcome/sign-in',
    createAccount: '/welcome/create-account',
  },
} as const;

/**
 * The Terms of Service and the Privacy Policy, at the addresses the website
 * will have. Until it does they answer 404, see
 * contributing/cloud-account.md.
 */
const termsOfServiceUrl = 'https://elek.io/terms';
const privacyPolicyUrl = 'https://elek.io/privacy';

/**
 * How long the button waits after elek.io Cloud refused too many attempts. A
 * fixed wait, since Core does not yet pass on the Retry-After Cloud sends.
 *
 * @todo Wait as long as Cloud says, once Core's RateLimited carries it
 */
const RATE_LIMIT_WAIT_SECONDS = 10;

// Core's account schemas, each field first checked for a value, so an empty
// one says what it asks for
const signInFormSchema = signInSchema.extend({
  email: requiredField(signInSchema.shape.email, 'Enter your email address.'),
  password: requiredField(signInSchema.shape.password, 'Enter your password.'),
});
const signUpFormSchema = signUpSchema.extend({
  name: requiredField(signUpSchema.shape.name, 'Enter your name.'),
  email: requiredField(signUpSchema.shape.email, 'Enter your email address.'),
  password: requiredField(signUpSchema.shape.password, 'Enter your password.'),
});

const failureCopy = {
  unreachable:
    "Can't reach elek.io Cloud. Check your internet connection and try again.",
  refused: "elek.io Cloud didn't accept this. Check each field and try again.",
  unconfirmed:
    "This account isn't confirmed yet, and this version of Desktop can't confirm it.",
  verification:
    "Your account needs a confirmed email address, and this version of Desktop can't confirm one yet. Sign in once an update can.",
} as const;

/**
 * Counts down the wait after a `RateLimited`, in whole seconds, so the button
 * can say how long is left.
 */
function useRetryCountdown(): { secondsLeft: number; start: () => void } {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) {
      return;
    }
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= until) {
        setUntil(null);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [until]);

  const start = useCallback(() => {
    const time = Date.now();
    setNow(time);
    setUntil(time + RATE_LIMIT_WAIT_SECONDS * 1000);
  }, []);

  return {
    secondsLeft:
      until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)),
    start,
  };
}

/**
 * What every account form does with the failures it shares. Each one the
 * person acts on in the form says so in one line above the button, and
 * `RateLimited` makes the button wait. See contributing/error-handling.md.
 */
function sharedFailureHandlers(
  setFailure: (failure: string | null) => void,
  startWait: () => void
): CoreErrorHandlers {
  return {
    PreconditionFailed: () => setFailure(failureCopy.unreachable),
    BadRequest: () => setFailure(failureCopy.refused),
    RateLimited: () => {
      setFailure(null);
      startWait();
    },
  };
}

/** A failed submit the person acts on in the form, one line above the button */
function FormFailure({ children }: { children: ReactNode }): ReactElement {
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 text-sm text-destructive"
    >
      <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** The form's one primary button, which waits out a rate limit */
function AccountSubmitButton({
  secondsLeft,
  Icon,
  children,
}: {
  secondsLeft: number;
  Icon: typeof LogInIcon;
  children: string;
}): ReactElement {
  return (
    <SubmitButton className="w-full" disabled={secondsLeft > 0} Icon={Icon}>
      {secondsLeft > 0
        ? `Try again in ${secondsLeft} ${secondsLeft === 1 ? 'second' : 'seconds'}`
        : children}
    </SubmitButton>
  );
}

/**
 * Where resetting a password starts. elek.io Cloud sends no code yet and Core
 * has no call to reset one, so it does nothing until both do.
 *
 * @todo Open Reset password once Core can reset one, see
 * contributing/not-yet-implemented.md
 */
function ForgotPasswordLink(): ReactElement {
  return (
    <Button
      type="button"
      variant="link"
      size="xs"
      className="h-auto border-0 p-0 text-xs"
      disabled
    >
      Forgot your password?
    </Button>
  );
}

function AlternativeLink({
  question,
  to,
  children,
}: {
  question: string;
  to: string;
  children: string;
}): ReactElement {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {question}{' '}
      <Link
        to={to}
        className="text-foreground underline underline-offset-4 hover:text-primary"
      >
        {children}
      </Link>
    </p>
  );
}

/**
 * An account page: the form stands alone, centered and narrow, in today's
 * Page. See contributing/cloud-account.md.
 */
export function AccountPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}): ReactElement {
  return (
    <Page title={title} description={<>{description}</>} layout="bare">
      <Card className="mx-auto w-full max-w-sm p-6">{children}</Card>
    </Page>
  );
}

function SignInForm({
  origin,
  defaultEmail,
}: {
  origin: AccountPageOrigin;
  defaultEmail: string;
}): ReactElement {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const wait = useRetryCountdown();
  const form = useForm<SignInProps>({
    resolver: zodResolver(signInFormSchema),
    defaultValues: { email: defaultEmail, password: '' },
  });
  const { mutateAsync: signIn, handleError } = useAppMutation(
    queryOptions.cloud.account.signIn,
    {
      handled: {
        ...sharedFailureHandlers(setFailure, wait.start),
        Unauthorized: () =>
          form.setError(
            'password',
            { message: 'The email address or the password is wrong.' },
            { shouldFocus: true }
          ),
        Conflict: () => setFailure(failureCopy.unconfirmed),
      },
    }
  );

  const onSubmit: SubmitHandler<SignInProps> = async (props) => {
    setFailure(null);
    try {
      await signIn(props);
      await router.navigate({ to: '/projects' });
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <AppForm form={form} onSubmit={onSubmit} fieldsetClassName="grid gap-6">
      <FormField
        control={form.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired>Email address</FormLabel>
            <FormControl>
              <FormInputField
                field={field}
                type="email"
                autoComplete="username"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel isRequired>Password</FormLabel>
              <ForgotPasswordLink />
            </div>
            <FormPasswordField field={field} autoComplete="current-password" />
            <FormMessage />
          </FormItem>
        )}
      />
      {failure !== null ? <FormFailure>{failure}</FormFailure> : null}
      <FormActions form={form}>
        <AccountSubmitButton secondsLeft={wait.secondsLeft} Icon={LogInIcon}>
          Sign in
        </AccountSubmitButton>
      </FormActions>
      <AlternativeLink
        question="No account yet?"
        to={accountPaths[origin].createAccount}
      >
        Create one
      </AlternativeLink>
    </AppForm>
  );
}

function CreateAccountForm({
  origin,
  defaults,
}: {
  origin: AccountPageOrigin;
  defaults: { name: string; email: string };
}): ReactElement {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const wait = useRetryCountdown();
  const form = useForm<SignUpProps>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { ...defaults, password: '' },
  });
  const { mutateAsync: signUp, handleError } = useAppMutation(
    queryOptions.cloud.account.signUp,
    {
      handled: {
        ...sharedFailureHandlers(setFailure, wait.start),
        // An account holds this address already
        Conflict: () =>
          form.setError(
            'email',
            {
              type: 'taken',
              message: 'An account uses this email address already.',
            },
            { shouldFocus: true }
          ),
      },
    }
  );

  const onSubmit: SubmitHandler<SignUpProps> = async (props) => {
    setFailure(null);
    try {
      const answer = await signUp(props);
      if (answer.outcome === 'verification') {
        // @todo Ask for the code from the email once Core can send it on
        setFailure(failureCopy.verification);
        return;
      }
      toast.success('Signed in to elek.io Cloud');
      await router.navigate({ to: '/projects' });
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <AppForm form={form} onSubmit={onSubmit} fieldsetClassName="grid gap-6">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel isRequired>Name</FormLabel>
            <FormControl>
              <FormInputField field={field} type="text" autoComplete="name" />
            </FormControl>
            <FormDescription>
              Shown in the History next to your changes.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="email"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel isRequired>Email address</FormLabel>
            <FormControl>
              <FormInputField
                field={field}
                type="email"
                autoComplete="username"
              />
            </FormControl>
            {/* @todo Send the code once elek.io Cloud and Core can */}
            <FormDescription>
              You get a code there to confirm it.
            </FormDescription>
            <FormMessage />
            {fieldState.error?.type === 'taken' ? (
              <p className="text-sm">
                <Link
                  to={accountPaths[origin].signIn}
                  className="underline underline-offset-4 hover:text-primary"
                >
                  Sign in
                </Link>{' '}
                instead.
              </p>
            ) : null}
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel isRequired>Password</FormLabel>
              <span className="text-xs text-muted-foreground">
                12 to 128 characters
              </span>
            </div>
            <FormPasswordField field={field} autoComplete="new-password" />
            <FormMessage />
          </FormItem>
        )}
      />
      {failure !== null ? <FormFailure>{failure}</FormFailure> : null}
      <FormActions form={form}>
        <AccountSubmitButton secondsLeft={wait.secondsLeft} Icon={UserPlusIcon}>
          Create account
        </AccountSubmitButton>
      </FormActions>
      <p className="text-center text-xs text-muted-foreground">
        <span className="block">
          By creating an account, you agree to the{' '}
          <a
            href={termsOfServiceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            Terms of Service
          </a>
          .
        </span>
        <span className="block">
          The{' '}
          <a
            href={privacyPolicyUrl}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-4"
          >
            Privacy Policy
          </a>{' '}
          says what elek.io Cloud does with your data.
        </span>
      </p>
      <AlternativeLink
        question="Have an account?"
        to={accountPaths[origin].signIn}
      >
        Sign in
      </AlternativeLink>
    </AppForm>
  );
}

function SignInAgainForm({ user }: { user: User }): ReactElement {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const wait = useRetryCountdown();
  // The account is the User's, read-only. Switching to another one goes
  // through Sign out.
  const form = useForm<SignInProps>({
    resolver: zodResolver(signInFormSchema),
    defaultValues: { email: user.email, password: '' },
  });
  const { mutateAsync: signIn, handleError } = useAppMutation(
    queryOptions.cloud.account.signIn,
    {
      handled: {
        ...sharedFailureHandlers(setFailure, wait.start),
        Unauthorized: () =>
          form.setError(
            'password',
            { message: 'The password is wrong.' },
            { shouldFocus: true }
          ),
        Conflict: () => setFailure(failureCopy.unconfirmed),
      },
    }
  );

  const onSubmit: SubmitHandler<SignInProps> = async (props) => {
    setFailure(null);
    try {
      await signIn(props);
      await router.navigate({ to: '/projects' });
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <AppForm form={form} onSubmit={onSubmit} fieldsetClassName="grid gap-6">
      <div className="grid gap-2">
        <p className="text-sm leading-none font-medium">Account</p>
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <Avatar className="h-8 w-8 rounded-lg" name={user.name} />
          <div className="grid text-sm leading-tight">
            <span className="truncate">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </div>
        </div>
      </div>
      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel isRequired>Password</FormLabel>
              <ForgotPasswordLink />
            </div>
            <FormPasswordField field={field} autoComplete="current-password" />
            <FormMessage />
          </FormItem>
        )}
      />
      {failure !== null ? <FormFailure>{failure}</FormFailure> : null}
      <FormActions form={form}>
        <AccountSubmitButton secondsLeft={wait.secondsLeft} Icon={LogInIcon}>
          Sign in
        </AccountSubmitButton>
      </FormActions>
    </AppForm>
  );
}

/**
 * Sign in. Only for a person not signed in: signed in it leads to the
 * Projects page, and after a session ended to Sign in again.
 */
export function SignInPage({
  origin,
}: {
  origin: AccountPageOrigin;
}): ReactElement {
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();
  const account = useCloudAccount();

  if (account === 'cloud') {
    return <Navigate to="/projects" />;
  }
  if (account === 'paused') {
    return <Navigate to="/projects/sign-in-again" />;
  }

  return (
    <AccountPage
      title="Sign in to elek.io Cloud"
      description="Open and sync your Projects on elek.io Cloud."
    >
      {isGettingUser ? null : (
        <SignInForm origin={origin} defaultEmail={user?.email ?? ''} />
      )}
    </AccountPage>
  );
}

/** Create account, filled from the User on this computer when there is one */
export function CreateAccountPage({
  origin,
}: {
  origin: AccountPageOrigin;
}): ReactElement {
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();
  const account = useCloudAccount();

  if (account === 'cloud' || account === 'paused') {
    return <Navigate to="/projects" />;
  }

  return (
    <AccountPage
      title="Create an elek.io Cloud account"
      description="The account costs nothing. With it, you create or join organizations on elek.io Cloud."
    >
      {isGettingUser ? null : (
        <CreateAccountForm
          origin={origin}
          defaults={{ name: user?.name ?? '', email: user?.email ?? '' }}
        />
      )}
    </AccountPage>
  );
}

/** Sign in again, only after a session ended */
export function SignInAgainPage(): ReactElement | null {
  const {
    userQuery: { data: user, isPending: isGettingUser },
  } = useUser();
  const account = useCloudAccount();

  if (isGettingUser || account === null) {
    return null;
  }
  if (account !== 'paused' || user === null) {
    return <Navigate to="/projects" />;
  }

  return (
    <AccountPage
      title="Sign in again"
      description="Your session with elek.io Cloud ended. Sign in to sync your Cloud Projects again."
    >
      <SignInAgainForm user={user} />
    </AccountPage>
  );
}
