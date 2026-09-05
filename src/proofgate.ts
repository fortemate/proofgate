import {
  RuntimeState,
  SemanticEvent,
  SituationSpecification,
  createAgent,
  createHuman,
  defineRuntime,
  type FunctionCallOutputItem,
  type SituationContext,
  type SituationHandler,
  type Tool,
} from '@mozaik-ai/core';

import {
  attest,
  digestProofCase,
  evidenceRoles,
  parseEvidenceObservation,
  type EvidenceObservation,
  type EvidenceRole,
  type GateVerdict,
  type ProofCase,
  type ProofGateResult,
  type TimelineEntry,
} from './domain.js';
import { DeterministicEvidenceRunner } from './inference-runner.js';

class ProofGateState extends RuntimeState {
  public readonly timeline: TimelineEntry[] = [];
}

class EventTypeSpecification extends SituationSpecification {
  public constructor(private readonly eventType: string) {
    super();
  }

  public isSatisfiedBy(context: SituationContext): boolean {
    return context.event.type === this.eventType;
  }
}

class AnyEventSpecification extends SituationSpecification {
  public isSatisfiedBy(_context: SituationContext): boolean {
    return true;
  }
}

function on(
  eventType: string,
  apply: (context: SituationContext) => void,
): SituationHandler {
  return {
    specification: new EventTypeSpecification(eventType),
    processor: { apply },
  };
}

function createEvidenceTool(
  role: EvidenceRole,
  proofCase: ProofCase,
  caseDigest: string,
): Tool {
  const definition = proofCase.evidence[role];
  return {
    type: 'function',
    name: `inspect_${role}`,
    description: `Read synthetic ${role} evidence for the current proof case.`,
    strict: true,
    parameters: {
      type: 'object',
      properties: { caseDigest: { type: 'string' } },
      required: ['caseDigest'],
      additionalProperties: false,
    },
    invoke: async (args: unknown) => {
      if (
        !args ||
        typeof args !== 'object' ||
        (args as Record<string, unknown>).caseDigest !== caseDigest
      ) {
        throw new Error('case digest mismatch');
      }
      if (definition.behavior === 'throw') {
        throw new Error(`synthetic ${role} evidence source unavailable`);
      }
      return {
        caseDigest,
        role,
        check: definition.check,
        status: definition.status,
        summary: definition.summary,
        source: 'synthetic-fixture',
      } satisfies EvidenceObservation;
    },
  };
}

function getLoopId(context: SituationContext): string | undefined {
  const payload = context.event.payload;
  if (!payload || typeof payload !== 'object') return undefined;
  const loopId = (payload as Record<string, unknown>).loopId;
  return typeof loopId === 'string' ? loopId : undefined;
}

function actorName(
  producerId: string,
  roleByAgentId: ReadonlyMap<string, EvidenceRole>,
  controllerId: string,
): string {
  return (
    roleByAgentId.get(producerId) ??
    (producerId === controllerId ? 'controller' : 'runtime')
  );
}

export async function runProofGate(
  proofCase: ProofCase,
  options: { readonly timeoutMs?: number } = {},
): Promise<ProofGateResult> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const caseDigest = digestProofCase(proofCase);
  const state = new ProofGateState();
  const observations = new Map<EvidenceRole, EvidenceObservation>();
  const failures = new Map<EvidenceRole, string>();
  const completions = new Set<EvidenceRole>();
  const roleByAgentId = new Map<string, EvidenceRole>();
  const loopByRole = new Map<EvidenceRole, string>();
  let controllerId = '';
  let finalVerdict: GateVerdict | undefined;
  let resolveResult: ((verdict: GateVerdict) => void) | undefined;
  const resultPromise = new Promise<GateVerdict>((resolve) => {
    resolveResult = resolve;
  });

  const mozaik = defineRuntime<ProofGateState>();
  mozaik.initializeRuntime({
    state,
    inferenceRunnerConfig: {
      runner: new DeterministicEvidenceRunner(caseDigest, {
        build: proofCase.evidence.build.delayMs,
        policy: proofCase.evidence.policy.delayMs,
        experiment: proofCase.evidence.experiment.delayMs,
      }),
    },
  });

  const finalizeIfTerminal = (): void => {
    if (finalVerdict) return;
    const allTerminal = evidenceRoles.every(
      (role) => failures.has(role) || completions.has(role),
    );
    if (!allTerminal) return;

    finalVerdict = attest(caseDigest, observations, failures);
    mozaik.sendEvent(
      SemanticEvent.create('gate.updated', controllerId, finalVerdict),
      controller.getId(),
    );
    resolveResult?.(finalVerdict);
  };

  const observer: SituationHandler = {
    specification: new AnyEventSpecification(),
    processor: {
      apply: (context) => {
        const loopId = getLoopId(context);
        state.timeline.push({
          sequence: state.timeline.length + 1,
          type: context.event.type,
          actor: actorName(
            context.event.producerId,
            roleByAgentId,
            controllerId,
          ),
          ...(loopId ? { loopId } : {}),
        });

        const role = roleByAgentId.get(context.event.producerId);
        if (role && loopId && !loopByRole.has(role)) {
          loopByRole.set(role, loopId);
        }
      },
    },
  };

  const controller = createHuman({
    name: 'ProofGate controller',
    capabilities: ['observe', 'attest'],
    handlers: [observer],
  });
  controllerId = controller.getId();
  mozaik.join(controller);

  for (const role of evidenceRoles) {
    let agentId = '';
    const handlers: SituationHandler[] = [
      on('case.announced', () => {
        const agent = mozaik.resolveParticipant(agentId);
        mozaik.runLoop(
          agentId,
          `Inspect ${role} evidence for case ${caseDigest}.`,
          {
            model: 'proofgate-deterministic-v1',
            context: (agent as ReturnType<typeof createAgent>)
              .getMemory()
              .getContext(),
            tools: (agent as ReturnType<typeof createAgent>).getTools(),
          },
        );
      }),
      on('function_call.completed', (context) => {
        if (context.event.producerId !== agentId) return;
        const payload = context.event.payload as {
          output?: FunctionCallOutputItem['output'];
        };
        try {
          const observation = parseEvidenceObservation(
            payload.output?.text ?? '',
            role,
            caseDigest,
          );
          observations.set(role, observation);
          mozaik.sendEvent(
            SemanticEvent.create('evidence.observed', agentId, observation),
            agentId,
          );
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : 'unknown evidence error';
          failures.set(role, reason);
          mozaik.sendEvent(
            SemanticEvent.create('participant.failed', agentId, {
              caseDigest,
              role,
              reason,
            }),
            agentId,
          );
          finalizeIfTerminal();
        }
      }),
      on('model.answer', (context) => {
        if (context.event.producerId !== agentId) return;
        completions.add(role);
        mozaik.sendEvent(
          SemanticEvent.create('participant.completed', agentId, {
            caseDigest,
            role,
          }),
          agentId,
        );
        finalizeIfTerminal();
      }),
    ];

    const agent = createAgent({
      name: `${role} evidence agent`,
      capabilities: [`inspect-${role}-evidence`],
      instruction:
        'Read exactly one synthetic evidence source. Never change infrastructure or decide the gate.',
      tools: [createEvidenceTool(role, proofCase, caseDigest)],
      handlers,
    });
    agentId = agent.getId();
    roleByAgentId.set(agentId, role);
    mozaik.join(agent);
  }

  const timeout = setTimeout(() => {
    if (finalVerdict) return;
    for (const role of evidenceRoles) {
      if (!completions.has(role) && !failures.has(role)) {
        failures.set(role, 'timed out before producing complete evidence');
      }
    }
    mozaik.sendEvent(
      SemanticEvent.create('gate.timeout', controllerId, { caseDigest }),
      controller.getId(),
    );
    finalizeIfTerminal();
  }, timeoutMs);

  mozaik.sendEvent(
    SemanticEvent.create('case.announced', controllerId, {
      caseDigest,
      caseId: proofCase.id,
    }),
    controller.getId(),
  );

  const verdict = await resultPromise;
  clearTimeout(timeout);

  const loopIds = Object.fromEntries(
    evidenceRoles.map((role) => [role, loopByRole.get(role) ?? 'missing']),
  ) as Record<EvidenceRole, string>;
  const firstInferenceCompleted = state.timeline.findIndex(
    (entry) => entry.type === 'inference.completed',
  );
  const startedBeforeFirstCompletion = new Set(
    state.timeline
      .slice(
        0,
        firstInferenceCompleted < 0 ? undefined : firstInferenceCompleted,
      )
      .filter((entry) => entry.type === 'inference.started')
      .map((entry) => entry.loopId),
  );

  return {
    fixture: proofCase.id,
    verdict,
    timeline: state.timeline,
    loopIds,
    concurrencyObserved:
      new Set(Object.values(loopIds)).size === evidenceRoles.length &&
      startedBeforeFirstCompletion.size === evidenceRoles.length,
  };
}
