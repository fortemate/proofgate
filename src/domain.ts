import { createHash } from 'node:crypto';

export const evidenceRoles = ['build', 'policy', 'experiment'] as const;

export type EvidenceRole = (typeof evidenceRoles)[number];
export type CheckStatus = 'PASS' | 'FAIL';
export type GateStatus = 'BLOCKED' | 'READY_FOR_HUMAN';

export interface EvidenceDefinition {
  readonly check: string;
  readonly status: CheckStatus;
  readonly summary: string;
  readonly behavior?: 'return' | 'throw';
  readonly delayMs: number;
}

export interface ProofCase {
  readonly id: string;
  readonly release: string;
  readonly experiment: string;
  readonly evidence: Readonly<Record<EvidenceRole, EvidenceDefinition>>;
}

export interface EvidenceObservation {
  readonly caseDigest: string;
  readonly role: EvidenceRole;
  readonly check: string;
  readonly status: CheckStatus;
  readonly summary: string;
  readonly source: 'synthetic-fixture';
}

export interface GateVerdict {
  readonly caseDigest: string;
  readonly status: GateStatus;
  readonly reasons: readonly string[];
  readonly evidence: readonly EvidenceObservation[];
  readonly attestor: 'proofgate-deterministic-v1';
}

export interface TimelineEntry {
  readonly sequence: number;
  readonly type: string;
  readonly actor: string;
  readonly loopId?: string;
}

export interface ProofGateResult {
  readonly fixture: string;
  readonly verdict: GateVerdict;
  readonly timeline: readonly TimelineEntry[];
  readonly loopIds: Readonly<Record<EvidenceRole, string>>;
  readonly concurrencyObserved: boolean;
}

export function digestProofCase(proofCase: ProofCase): string {
  const canonical = {
    id: proofCase.id,
    release: proofCase.release,
    experiment: proofCase.experiment,
    evidence: evidenceRoles.map((role) => ({
      role,
      check: proofCase.evidence[role].check,
      status: proofCase.evidence[role].status,
      summary: proofCase.evidence[role].summary,
      behavior: proofCase.evidence[role].behavior ?? 'return',
    })),
  };

  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function attest(
  caseDigest: string,
  observations: ReadonlyMap<EvidenceRole, EvidenceObservation>,
  failures: ReadonlyMap<EvidenceRole, string>,
): GateVerdict {
  const reasons: string[] = [];

  for (const role of evidenceRoles) {
    const failure = failures.get(role);
    const observation = observations.get(role);

    if (failure) {
      reasons.push(`${role}: ${failure}`);
    } else if (!observation) {
      reasons.push(`${role}: evidence missing`);
    } else if (observation.caseDigest !== caseDigest) {
      reasons.push(`${role}: evidence belongs to another case`);
    } else if (observation.status === 'FAIL') {
      reasons.push(`${role}: ${observation.summary}`);
    }
  }

  return {
    caseDigest,
    status: reasons.length === 0 ? 'READY_FOR_HUMAN' : 'BLOCKED',
    reasons,
    evidence: evidenceRoles.flatMap((role) => {
      const observation = observations.get(role);
      return observation ? [observation] : [];
    }),
    attestor: 'proofgate-deterministic-v1',
  };
}

export function isEvidenceRole(value: unknown): value is EvidenceRole {
  return evidenceRoles.includes(value as EvidenceRole);
}

export function parseEvidenceObservation(
  value: string,
  expectedRole: EvidenceRole,
  expectedDigest: string,
): EvidenceObservation {
  if (value.startsWith('Error calling tool:')) {
    throw new Error('evidence tool failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('evidence is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('evidence is not an object');
  }

  const candidate = parsed as Record<string, unknown>;
  if (
    candidate.caseDigest !== expectedDigest ||
    candidate.role !== expectedRole ||
    typeof candidate.check !== 'string' ||
    (candidate.status !== 'PASS' && candidate.status !== 'FAIL') ||
    typeof candidate.summary !== 'string' ||
    candidate.source !== 'synthetic-fixture'
  ) {
    throw new Error('evidence failed schema or case binding validation');
  }

  return candidate as unknown as EvidenceObservation;
}
