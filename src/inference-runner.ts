import {
  FunctionCallItem,
  ModelMessageItem,
  SemanticEvent,
  type InferenceInput,
  type InferenceOutput,
  type InferenceRunner,
} from '@mozaik-ai/core';

import type { EvidenceRole } from './domain.js';

const toolRoles = {
  inspect_build: 'build',
  inspect_policy: 'policy',
  inspect_experiment: 'experiment',
} as const satisfies Record<string, EvidenceRole>;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class DeterministicEvidenceRunner implements InferenceRunner {
  public constructor(
    private readonly caseDigest: string,
    private readonly delays: Readonly<Record<EvidenceRole, number>>,
  ) {}

  public async run(request: InferenceInput): Promise<InferenceOutput> {
    const tool = request.tools?.[0];
    const role = tool
      ? toolRoles[tool.name as keyof typeof toolRoles]
      : undefined;
    if (!tool || !role) {
      throw new Error('ProofGate agent has no recognized evidence tool.');
    }

    const hasToolOutput = request.context
      .getItems()
      .some((item) => item.type === 'function_call_output');

    if (!hasToolOutput) {
      await delay(this.delays[role]);
      return {
        items: [
          FunctionCallItem.rehydrate({
            callId: `proof-${role}-${this.caseDigest.slice(0, 12)}`,
            name: tool.name,
            args: JSON.stringify({ caseDigest: this.caseDigest }),
          }),
        ],
        tokenUsage: undefined,
        rowResponse: { mode: 'deterministic', phase: 'tool-call' },
      };
    }

    return {
      items: [
        ModelMessageItem.rehydrate({
          text: `${role} evidence inspection completed; deterministic attestation remains authoritative.`,
        }),
      ],
      tokenUsage: undefined,
      rowResponse: { mode: 'deterministic', phase: 'answer' },
    };
  }

  public async *stream(
    _request: InferenceInput,
  ): AsyncGenerator<SemanticEvent> {
    throw new Error('ProofGate MVP does not use streaming inference.');
  }
}
