import type { ProofCase } from './domain.js';

const ready: ProofCase = {
  id: 'ready-release-42',
  release: 'proofgate-demo@42',
  experiment: 'safe-rollout-a',
  evidence: {
    build: {
      check: 'artifact-integrity',
      status: 'PASS',
      summary: 'Synthetic artifact digest and provenance are consistent.',
      delayMs: 70,
    },
    policy: {
      check: 'release-policy',
      status: 'PASS',
      summary: 'Synthetic approvals and change window satisfy policy.',
      delayMs: 95,
    },
    experiment: {
      check: 'experiment-guardrails',
      status: 'PASS',
      summary: 'Synthetic exposure and rollback thresholds are safe.',
      delayMs: 55,
    },
  },
};

const blocked: ProofCase = {
  ...ready,
  id: 'blocked-release-43',
  release: 'proofgate-demo@43',
  evidence: {
    ...ready.evidence,
    experiment: {
      ...ready.evidence.experiment,
      status: 'FAIL',
      summary: 'Synthetic error budget is below the rollout threshold.',
    },
  },
};

const failure: ProofCase = {
  ...ready,
  id: 'failed-observer-44',
  release: 'proofgate-demo@44',
  evidence: {
    ...ready.evidence,
    policy: {
      ...ready.evidence.policy,
      behavior: 'throw',
      summary: 'This value must never be accepted after the tool fails.',
    },
  },
};

export const fixtures = { ready, blocked, failure } as const;
export type FixtureName = keyof typeof fixtures;

export function getFixture(name: string): ProofCase {
  const fixture = fixtures[name as FixtureName];
  if (!fixture) {
    throw new Error(
      `Unknown fixture "${name}". Choose one of: ${Object.keys(fixtures).join(', ')}.`,
    );
  }
  return fixture;
}
