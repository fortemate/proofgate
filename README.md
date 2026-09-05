# ProofGate

ProofGate is a read-only release and experiment evidence control room. Three
concurrent Mozaik agents inspect independent evidence lanes, publish their
observations to one event ledger, and hand those observations to a deterministic
attestor.

The only outcomes are:

- `BLOCKED` — evidence is missing, invalid, unavailable, or explicitly failing.
- `READY_FOR_HUMAN` — every required check passed; a person still owns the
  release decision.

ProofGate never deploys, rolls back, changes a flag, or writes to production.

## MVP architecture

```text
                         synthetic proof case
                                  |
                    case.announced semantic event
                    /             |              \
          build evidence    policy evidence    experiment evidence
          Mozaik agent      Mozaik agent       Mozaik agent
          + read tool       + read tool        + read tool
                    \             |              /
                     evidence + completion events
                                  |
                         shared event ledger
                                  |
                    deterministic fail-closed attestor
                                  |
                    BLOCKED | READY_FOR_HUMAN
```

Each evidence lane is a real `createAgent` participant and starts its own Mozaik
`runLoop`. The deterministic inference runner makes the public demo reproducible
and free of external model credentials while retaining the framework's actual
message, inference, tool-call, answer, and Cloud telemetry lifecycle.

The attestor reads validated tool output, never natural-language model output.
Every observation is bound to a SHA-256 digest of the proof case. A failed tool,
bad schema, wrong digest, failed check, or timeout closes the gate.

## Run it

Requires Node.js 20 or newer.

```bash
npm install
npm run demo -- ready
npm run demo -- blocked
npm run demo -- failure
```

Start the visual Control Room at `http://127.0.0.1:4173`:

```bash
npm start
```

The local UI can run all three proof cases, compare evidence lanes, and inspect
the redacted event ledger. Its HTTP server binds to localhost by default and
exposes only synthetic scenarios.

Use `--json` to inspect the redacted event timeline and the three loop IDs:

```bash
npm run demo -- ready --json
```

Run all checks:

```bash
npm run check
npm run build
```

## Mozaik Cloud

Pair the working copy once:

```bash
npx @mozaik-ai/cloud-sdk pair
```

With Mozaik 4.x, framework loop events are then sent to the paired Cloud project
automatically. Run a demo and open **Agents** in Mozaik Cloud to inspect the three
overlapping traces. Pairing credentials stay outside the repository; never commit
an API key or paste one into an issue.

## Public-safe boundary

The repository contains only synthetic fixtures. It has no Fortemate production
URLs, private policies, model artifacts, tokens, or deployment integrations. A
future connector must remain read-only, redact source payloads, and convert them
into the small `EvidenceObservation` contract before the attestor sees them.

This is deliberate: the hackathon demo shows concurrent evidence collection and
explainable gating without exposing proprietary systems or granting an agent
production authority.

## Scenarios

| Fixture   | Evidence condition                  | Expected verdict  |
| --------- | ----------------------------------- | ----------------- |
| `ready`   | all three checks pass               | `READY_FOR_HUMAN` |
| `blocked` | experiment guardrail fails          | `BLOCKED`         |
| `failure` | policy evidence tool is unavailable | `BLOCKED`         |

## License

[MIT](LICENSE)
