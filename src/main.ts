#!/usr/bin/env node

import { getFixture } from './fixtures.js';
import { runProofGate } from './proofgate.js';

const args = process.argv.slice(2);
const fixtureName =
  args.find((argument) => !argument.startsWith('--')) ?? 'ready';
const json = args.includes('--json');

try {
  const result = await runProofGate(getFixture(fixtureName));

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nProofGate: ${result.verdict.status}`);
    console.log(`Case:      ${result.fixture}`);
    console.log(`Digest:    ${result.verdict.caseDigest}`);
    console.log(
      `Concurrent Mozaik loops: ${result.concurrencyObserved ? 'yes' : 'no'}`,
    );
    console.log(`Evidence:  ${result.verdict.evidence.length}/3`);
    if (result.verdict.reasons.length > 0) {
      console.log('Reasons:');
      for (const reason of result.verdict.reasons) console.log(`  - ${reason}`);
    }
    console.log(
      '\nThis verdict is advisory. ProofGate never performs a release or rollout.',
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
