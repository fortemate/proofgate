import { describe, expect, it } from 'vitest';

import { digestProofCase, evidenceRoles } from '../src/domain.js';
import { fixtures, getFixture } from '../src/fixtures.js';
import { runProofGate } from '../src/proofgate.js';

describe('ProofGate MVP', () => {
  it('returns READY_FOR_HUMAN only when every evidence source passes', async () => {
    const result = await runProofGate(fixtures.ready);

    expect(result.verdict.status).toBe('READY_FOR_HUMAN');
    expect(result.verdict.evidence).toHaveLength(3);
    expect(result.verdict.reasons).toEqual([]);
  });

  it('blocks a release when an evidence source fails its check', async () => {
    const result = await runProofGate(fixtures.blocked);

    expect(result.verdict.status).toBe('BLOCKED');
    expect(result.verdict.reasons).toContain(
      'experiment: Synthetic error budget is below the rollout threshold.',
    );
  });

  it('fails closed when an evidence tool is unavailable', async () => {
    const result = await runProofGate(fixtures.failure);

    expect(result.verdict.status).toBe('BLOCKED');
    expect(result.verdict.evidence.map((item) => item.role)).not.toContain(
      'policy',
    );
    expect(result.verdict.reasons).toContain('policy: evidence tool failed');
  });

  it('runs three distinct Mozaik loops with observable overlap', async () => {
    const result = await runProofGate(fixtures.ready);

    expect(new Set(Object.values(result.loopIds))).toHaveLength(
      evidenceRoles.length,
    );
    expect(result.concurrencyObserved).toBe(true);
  });

  it('creates a stable digest independent of timing', () => {
    const changedDelay = {
      ...fixtures.ready,
      evidence: {
        ...fixtures.ready.evidence,
        build: { ...fixtures.ready.evidence.build, delayMs: 999 },
      },
    };

    expect(digestProofCase(changedDelay)).toBe(digestProofCase(fixtures.ready));
  });

  it('rejects inherited object properties as fixture names', () => {
    expect(() => getFixture('toString')).toThrow('Unknown fixture "toString"');
  });
});
