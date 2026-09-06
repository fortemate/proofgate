import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createControlRoomServer,
  type ControlRoomServerOptions,
} from '../src/server.js';

process.env.MOZAIK_API_KEY = '';

const servers: ReturnType<typeof createControlRoomServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

async function startServer(
  options: ControlRoomServerOptions = {},
): Promise<string> {
  const server = createControlRoomServer(options);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function waitForActiveRuns(origin: string, expected: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`${origin}/api/health`);
    const health = (await response.json()) as { activeRuns: number };
    if (health.activeRuns === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`activeRuns did not reach ${expected}`);
}

describe('ProofGate Control Room server', () => {
  it('serves the control room with restrictive browser headers', async () => {
    const origin = await startServer();
    const response = await fetch(origin);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    );
    expect(await response.text()).toContain('Evidence before action.');
  });

  it('runs a selected proof case through the HTTP API', async () => {
    const origin = await startServer();
    const response = await fetch(`${origin}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture: 'blocked' }),
    });
    const result = (await response.json()) as {
      verdict: { status: string; reasons: string[] };
      concurrencyObserved: boolean;
    };

    expect(response.status).toBe(200);
    expect(result.verdict.status).toBe('BLOCKED');
    expect(result.verdict.reasons).toHaveLength(1);
    expect(result.concurrencyObserved).toBe(true);
  });

  it('rejects unknown fixtures without starting an evaluation', async () => {
    const origin = await startServer();
    const response = await fetch(`${origin}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture: 'toString' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        'Unknown fixture "toString". Choose one of: ready, blocked, failure.',
    });
  });

  it('rejects excess concurrent evaluations without queueing them', async () => {
    const origin = await startServer({ maximumConcurrentRuns: 1 });
    const firstRun = fetch(`${origin}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture: 'ready' }),
    });

    await waitForActiveRuns(origin, 1);
    const rejectedRun = await fetch(`${origin}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture: 'blocked' }),
    });

    expect(rejectedRun.status).toBe(429);
    expect(rejectedRun.headers.get('retry-after')).toBe('1');
    expect(await rejectedRun.json()).toEqual({
      error: 'too many evaluations in progress',
    });
    expect((await firstRun).status).toBe(200);
  });
});
