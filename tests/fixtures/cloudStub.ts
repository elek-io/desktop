import { randomUUID } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';

import {
  type CloudAccount,
  reportRequestSchema,
  type ReportRequest,
  signInSchema,
  signUpSchema,
} from '@elek-io/core';

import { test as base } from './electronApp.js';

/** Where Core sends a report, appended to its Cloud URL. */
const REPORT_PATH = '/management/v1/reports';

/** Where Core reaches the account, see Core's docs/cloud-account.md. */
const ACCOUNT_PATHS = {
  signUp: '/api/auth/sign-up/email',
  signIn: '/api/auth/sign-in/email',
  signOut: '/api/auth/sign-out',
  session: '/api/auth/get-session',
} as const;

/** The header a session's token arrives in, see Core's docs/cloud-account.md. */
const TOKEN_HEADER = 'set-auth-token';

/** An account the stub knows, with the password it takes. */
export interface CloudStubAccount extends CloudAccount {
  password: string;
}

export interface CloudStubAccounts {
  /** Create an account to sign in to, as if it was made elsewhere. */
  add: (account: Omit<CloudStubAccount, 'id'>) => CloudStubAccount;
  /** Every account the stub holds, those signed up for included. */
  list: () => CloudStubAccount[];
  /** Every token the stub handed out, in order. */
  issuedTokens: string[];
  /** The bearer token of every request that carried one, in order. */
  bearerTokens: string[];
  /** End every session, as if each one expired. */
  endSessions: () => void;
  /**
   * Answer every later sign in and sign up with this status and `code`, the
   * way Cloud refuses one. `null` goes back to answering.
   */
  refuseWith: (refusal: { status: number; code?: string } | null) => void;
  /**
   * Answer a sign up with the verification outcome, a token of null, as
   * Cloud does once it requires a confirmed address.
   */
  requireVerification: (isRequired: boolean) => void;
}

export interface CloudStub {
  /** The base URL the app is launched with as its Cloud. */
  url: string;
  /** Every report the stub accepted, in the order it arrived. */
  reports: ReportRequest[];
  /**
   * Answer every later report with this status instead of accepting it, the
   * way Cloud refuses one. `null` goes back to accepting.
   */
  refuseWith: (status: number | null) => void;
  /** The account routes, which answer as Core expects elek.io Cloud to. */
  accounts: CloudStubAccounts;
}

/** Malformed JSON is a rejected body to Cloud, so it is `undefined` here. */
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function answerJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  response
    .writeHead(status, { 'Content-Type': 'application/json', ...headers })
    .end(JSON.stringify(body));
}

/**
 * A local stand-in for the parts of elek.io Cloud Core calls.
 *
 * Reports are validated against Core's own `reportRequestSchema`, the contract
 * Cloud enforces too, and answered `201 { id }` or `400`, or `401` when they
 * carry a session that ended. The account routes
 * answer as Core's docs/cloud-account.md lists them: a session's token in the
 * `set-auth-token` header, `401` for a wrong address or password, `422` with
 * the code Core reads for an address an account holds, and `null` from the
 * session read once a session ended. No test may send to a real Cloud, dev
 * included, so this is the only way to see Cloud answer.
 */
async function startCloudStub(): Promise<
  CloudStub & { close: () => Promise<void> }
> {
  const reports: ReportRequest[] = [];
  let reportRefusal: number | null = null;

  const accounts = new Map<string, CloudStubAccount>();
  const sessions = new Map<string, string>();
  const issuedTokens: string[] = [];
  const bearerTokens: string[] = [];
  let accountRefusal: { status: number; code?: string } | null = null;
  let isVerificationRequired = false;

  const addAccount = (
    account: Omit<CloudStubAccount, 'id'>
  ): CloudStubAccount => {
    const added = { id: randomUUID(), ...account };
    accounts.set(added.email, added);
    return added;
  };
  const publicAccount = ({
    id,
    name,
    email,
  }: CloudStubAccount): CloudAccount => ({ id, name, email });
  const beginSession = (account: CloudStubAccount): string => {
    const token = `stub-${randomUUID()}`;
    issuedTokens.push(token);
    sessions.set(token, account.email);
    return token;
  };

  function answerAccount(
    path: string,
    body: string,
    bearer: string | null,
    response: ServerResponse
  ): void {
    const isSignInOrUp =
      path === ACCOUNT_PATHS.signIn || path === ACCOUNT_PATHS.signUp;
    if (isSignInOrUp && accountRefusal !== null) {
      answerJson(response, accountRefusal.status, {
        code: accountRefusal.code ?? 'REFUSED',
        message: 'Refused by the stub',
      });
      return;
    }

    switch (path) {
      case ACCOUNT_PATHS.signUp: {
        const parsed = signUpSchema.safeParse(parseJson(body));
        if (parsed.success === false) {
          answerJson(response, 400, { code: 'VALIDATION_ERROR' });
          return;
        }
        if (accounts.has(parsed.data.email)) {
          answerJson(response, 422, {
            code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
          });
          return;
        }
        const account = addAccount(parsed.data);
        if (isVerificationRequired) {
          answerJson(response, 200, {
            token: null,
            user: publicAccount(account),
          });
          return;
        }
        const token = beginSession(account);
        answerJson(
          response,
          200,
          { token, user: publicAccount(account) },
          { [TOKEN_HEADER]: token }
        );
        return;
      }
      case ACCOUNT_PATHS.signIn: {
        const parsed = signInSchema.safeParse(parseJson(body));
        if (parsed.success === false) {
          answerJson(response, 400, { code: 'VALIDATION_ERROR' });
          return;
        }
        const account = accounts.get(parsed.data.email);
        if (
          account === undefined ||
          account.password !== parsed.data.password
        ) {
          answerJson(response, 401, { code: 'INVALID_EMAIL_OR_PASSWORD' });
          return;
        }
        const token = beginSession(account);
        answerJson(
          response,
          200,
          { redirect: false, token, user: publicAccount(account) },
          { [TOKEN_HEADER]: token }
        );
        return;
      }
      case ACCOUNT_PATHS.session: {
        const email = bearer === null ? undefined : sessions.get(bearer);
        const account = email === undefined ? undefined : accounts.get(email);
        answerJson(
          response,
          200,
          account === undefined ? null : { user: publicAccount(account) }
        );
        return;
      }
      case ACCOUNT_PATHS.signOut: {
        if (bearer === null || sessions.delete(bearer) === false) {
          answerJson(response, 401, { code: 'UNAUTHORIZED' });
          return;
        }
        answerJson(response, 200, { success: true });
        return;
      }
      default:
        response.writeHead(404).end();
    }
  }

  const server = createServer((request, response) => {
    void (async () => {
      const authorization = request.headers.authorization;
      const bearer =
        authorization?.startsWith('Bearer ') === true
          ? authorization.slice('Bearer '.length)
          : null;
      if (bearer !== null) {
        bearerTokens.push(bearer);
      }

      const path = request.url ?? '';
      const body = await text(request);

      if (path.startsWith('/api/auth/')) {
        answerAccount(path, body, bearer, response);
        return;
      }

      if (request.method !== 'POST' || path !== REPORT_PATH) {
        response.writeHead(404).end();
        return;
      }

      if (reportRefusal !== null) {
        response.writeHead(reportRefusal).end();
        return;
      }

      // A report may come without a session, but one carrying a session that
      // ended is refused like any other call with it
      if (bearer !== null && sessions.has(bearer) === false) {
        answerJson(response, 401, { code: 'UNAUTHORIZED' });
        return;
      }

      const parsed = reportRequestSchema.safeParse(parseJson(body));
      if (parsed.success === false) {
        response.writeHead(400).end();
        return;
      }

      reports.push(parsed.data);
      answerJson(response, 201, { id: randomUUID() });
    })().catch(() => {
      response.writeHead(500).end();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The Cloud stub is not listening on a TCP port');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    reports,
    refuseWith: (status) => {
      reportRefusal = status;
    },
    accounts: {
      add: addAccount,
      list: () => [...accounts.values()],
      issuedTokens,
      bearerTokens,
      endSessions: () => sessions.clear(),
      refuseWith: (refusal) => {
        accountRefusal = refusal;
      },
      requireVerification: (isRequired) => {
        isVerificationRequired = isRequired;
      },
    },
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * The app fixtures with a Cloud stub in place of the closed port, for the
 * specs that need a send or a sign in to be answered.
 */
export const test = base.extend<{ cloudStub: CloudStub }>({
  // eslint-disable-next-line no-empty-pattern
  cloudStub: async ({}, use) => {
    const stub = await startCloudStub();
    await use(stub);
    await stub.close();
  },

  cloudUrl: async ({ cloudStub }, use) => {
    await use(cloudStub.url);
  },
});
