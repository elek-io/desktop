import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { text } from 'node:stream/consumers';

import { reportRequestSchema, type ReportRequest } from '@elek-io/core';

import { test as base } from './electronApp.js';

/** Where Core sends a report, appended to its Cloud URL. */
const REPORT_PATH = '/management/v1/reports';

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
}

/** Malformed JSON is a rejected body to Cloud, so it is `undefined` here. */
function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * A local stand-in for elek.io Cloud's report endpoint.
 *
 * It validates against Core's own `reportRequestSchema`, the contract Cloud
 * enforces too, and answers like Cloud: `201 { id }` for a valid report and
 * `400` for anything else. No test may send to a real Cloud, dev included, so
 * this is the only way to see a send succeed.
 */
async function startCloudStub(): Promise<
  CloudStub & { close: () => Promise<void> }
> {
  const reports: ReportRequest[] = [];
  let refusalStatus: number | null = null;

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'POST' || request.url !== REPORT_PATH) {
        response.writeHead(404).end();
        return;
      }

      const body = await text(request);

      if (refusalStatus !== null) {
        response.writeHead(refusalStatus).end();
        return;
      }

      const parsed = reportRequestSchema.safeParse(parseJson(body));
      if (parsed.success === false) {
        response.writeHead(400).end();
        return;
      }

      reports.push(parsed.data);
      response
        .writeHead(201, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ id: randomUUID() }));
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
      refusalStatus = status;
    },
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/**
 * The app fixtures with a Cloud stub in place of the closed port, for the
 * specs that need a send to be answered.
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
