import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFixture } from './fixtures.js';
import { runProofGate } from './proofgate.js';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const maximumBodyBytes = 4_096;
const defaultMaximumConcurrentRuns = 2;

export interface ControlRoomServerOptions {
  readonly maximumConcurrentRuns?: number;
}

class RunCapacity {
  private activeRuns = 0;

  public constructor(private readonly maximumConcurrentRuns: number) {
    if (!Number.isInteger(maximumConcurrentRuns) || maximumConcurrentRuns < 1) {
      throw new Error('maximumConcurrentRuns must be a positive integer');
    }
  }

  public tryAcquire(): boolean {
    if (this.activeRuns >= this.maximumConcurrentRuns) return false;
    this.activeRuns += 1;
    return true;
  }

  public release(): void {
    this.activeRuns -= 1;
  }
}

const assets = new Map([
  ['/', { file: 'index.html', contentType: 'text/html; charset=utf-8' }],
  [
    '/app.js',
    { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  ],
  [
    '/styles.css',
    { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  ],
]);

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
}

function sendJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
): void {
  applySecurityHeaders(response);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBodyBytes) throw new Error('request body is too large');
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('request body is not valid JSON');
  }
}

async function serveAsset(
  pathname: string,
  response: ServerResponse,
): Promise<boolean> {
  const asset = assets.get(pathname);
  if (!asset) return false;

  const body = await readFile(resolve(publicDirectory, asset.file));
  applySecurityHeaders(response);
  response.writeHead(200, {
    'Content-Type': asset.contentType,
    'Cache-Control': 'no-cache',
  });
  response.end(body);
  return true;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  runCapacity: RunCapacity,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');

  if (request.method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { status: 'ok', mode: 'synthetic-read-only' });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/runs') {
    if (!request.headers['content-type']?.startsWith('application/json')) {
      sendJson(response, 415, {
        error: 'content-type must be application/json',
      });
      return;
    }

    try {
      const body = (await readJsonBody(request)) as { fixture?: unknown };
      if (
        !body ||
        typeof body !== 'object' ||
        typeof body.fixture !== 'string'
      ) {
        throw new Error('fixture must be a string');
      }
      const fixture = getFixture(body.fixture);
      if (!runCapacity.tryAcquire()) {
        response.setHeader('Retry-After', '1');
        sendJson(response, 429, {
          error: 'too many evaluations in progress',
        });
        return;
      }

      try {
        const result = await runProofGate(fixture);
        sendJson(response, 200, result);
      } finally {
        runCapacity.release();
      }
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : 'invalid request',
      });
    }
    return;
  }

  if (request.method === 'GET' && (await serveAsset(url.pathname, response))) {
    return;
  }

  sendJson(response, 404, { error: 'not found' });
}

export function createControlRoomServer(
  options: ControlRoomServerOptions = {},
) {
  const runCapacity = new RunCapacity(
    options.maximumConcurrentRuns ?? defaultMaximumConcurrentRuns,
  );
  return createServer((request, response) => {
    void handleRequest(request, response, runCapacity).catch(
      (error: unknown) => {
        console.error(error);
        if (!response.headersSent) {
          sendJson(response, 500, { error: 'internal server error' });
        } else {
          response.destroy();
        }
      },
    );
  });
}

function parsePort(value: string | undefined): number {
  if (!value) return 4173;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseMaximumConcurrentRuns(value: string | undefined): number {
  if (!value) return defaultMaximumConcurrentRuns;
  const maximumConcurrentRuns = Number(value);
  if (!Number.isInteger(maximumConcurrentRuns) || maximumConcurrentRuns < 1) {
    throw new Error('MAX_CONCURRENT_RUNS must be a positive integer');
  }
  return maximumConcurrentRuns;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (import.meta.url === entrypoint) {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = parsePort(process.env.PORT);
  const maximumConcurrentRuns = parseMaximumConcurrentRuns(
    process.env.MAX_CONCURRENT_RUNS,
  );
  const server = createControlRoomServer({ maximumConcurrentRuns });
  server.listen(port, host, () => {
    console.log(`ProofGate Control Room: http://${host}:${port}`);
    console.log(`Concurrent evaluation limit: ${maximumConcurrentRuns}`);
    console.log(
      'Synthetic evidence only. No production actions are available.',
    );
  });
}
