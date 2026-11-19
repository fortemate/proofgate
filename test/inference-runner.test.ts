import { describe, expect, it } from 'vitest';
import type { InferenceInput } from '@mozaik-ai/core';
import { DeterministicEvidenceRunner } from '../src/inference-runner.js';

const message = 'ProofGate MVP does not use streaming inference.';
const runner = () =>
  new DeterministicEvidenceRunner('authored-case-digest', {
    build: 0,
    policy: 0,
    experiment: 0,
  });
function unreadableRequest() {
  let reads = 0;
  const request = new Proxy({} as InferenceInput, {
    get() {
      reads += 1;
      throw new Error('The unsupported stream must not consume its request.');
    },
  });
  return { request, reads: () => reads };
}

describe('unsupported native inference stream', () => {
  it('is lazy and is its own async iterator', () => {
    const input = unreadableRequest();
    const stream = runner().stream(input.request);
    expect(stream[Symbol.asyncIterator]()).toBe(stream);
    expect(input.reads()).toBe(0);
  });
  it('rejects the first next with the stable error without consuming input', async () => {
    const input = unreadableRequest();
    const stream = runner().stream(input.request);
    const first = stream.next();
    expect(first).toBeInstanceOf(Promise);
    await expect(first).rejects.toMatchObject({ name: 'Error', message });
    expect(input.reads()).toBe(0);
  });
  it('is closed after its unsupported-operation error', async () => {
    const stream = runner().stream(unreadableRequest().request);
    await expect(stream.next()).rejects.toThrow(message);
    await expect(stream.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });
  it('returns before starting without executing the body', async () => {
    const input = unreadableRequest();
    const stream = runner().stream(input.request);
    await expect(stream.return('authored-return')).resolves.toEqual({
      value: 'authored-return',
      done: true,
    });
    await expect(stream.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
    expect(input.reads()).toBe(0);
  });
  it('preserves a throw-before-start error by identity and closes', async () => {
    const input = unreadableRequest();
    const stream = runner().stream(input.request);
    const error = new Error('authored-before-start');
    await expect(stream.throw(error)).rejects.toBe(error);
    await expect(stream.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
    expect(input.reads()).toBe(0);
  });
  it('queues concurrent next requests through the first rejection and closure', async () => {
    const stream = runner().stream(unreadableRequest().request);
    const results = await Promise.allSettled([
      stream.next(),
      stream.next(),
      stream.next(),
    ]);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { name: 'Error', message },
    });
    expect(results.slice(1)).toEqual([
      { status: 'fulfilled', value: { value: undefined, done: true } },
      { status: 'fulfilled', value: { value: undefined, done: true } },
    ]);
  });
  it('preserves a later throw on the closed generator', async () => {
    const stream = runner().stream(unreadableRequest().request);
    await expect(stream.next()).rejects.toThrow(message);
    const error = new Error('authored-after-closure');
    await expect(stream.throw(error)).rejects.toBe(error);
    await expect(stream.next()).resolves.toEqual({
      value: undefined,
      done: true,
    });
  });
});
