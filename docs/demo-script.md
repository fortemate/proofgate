# ProofGate demo and screenshot guide

This guide keeps the submission demo short, verifiable, and free of private
information. The suggested recording is approximately **100–120 seconds**.

## Before recording

- Use a 16:9 window at 1920×1080, 1600×900, or 1280×720.
- Keep the browser at 100% zoom and make the complete verdict panel readable.
- Prepare two tabs: the local ProofGate Control Room and Mozaik Cloud **Agents**.
- Run a fresh `ready` case immediately before opening Mozaik Cloud so the three
  related traces are easy to identify.
- Hide bookmarks, notifications, email addresses, account menus, API keys, and
  unrelated browser tabs.
- Do not show a terminal command that contains a credential or a local private
  workspace path.

## Shot list

| Time      | Picture                       | Action                                                                         |
| --------- | ----------------------------- | ------------------------------------------------------------------------------ |
| 0:00–0:12 | Control Room hero             | Introduce the problem and the human-only safety boundary.                      |
| 0:12–0:38 | `Ready` scenario              | Start the evaluation and let all three evidence cards complete.                |
| 0:38–0:55 | Ready result and Event Ledger | Point out the three loop IDs, `overlap verified`, digest, and final verdict.   |
| 0:55–1:15 | `Blocked` scenario            | Show a valid observation that fails an experiment guardrail.                   |
| 1:15–1:33 | `Source failure` scenario     | Show that unavailable evidence fails closed rather than becoming a false pass. |
| 1:33–1:48 | Mozaik Cloud                  | Show the three concurrent agent traces for one proof case.                     |
| 1:48–2:00 | Control Room footer           | Close with the reusable product idea and human authority.                      |

## Suggested English narration

> Releases and experiments often depend on evidence scattered across several
> systems. ProofGate turns that evidence into one explainable, human-owned
> decision point.
>
> When I start an evaluation, one semantic event activates three real Mozaik
> agents at the same time. They independently inspect build integrity, release
> policy, and experiment safety, while a shared ledger records their interleaved
> events.
>
> Here all three checks pass. ProofGate verifies that three distinct loops
> overlapped, binds every observation to the same case digest, and returns
> READY FOR HUMAN. It does not release anything; a person still decides.
>
> In this second case, the experiment agent reports a failed guardrail, so the
> deterministic attestor blocks the candidate and explains why.
>
> A missing source is also unsafe. When the policy tool fails, the other agents
> still finish, the failure remains visible, and the gate fails closed.
>
> Mozaik Cloud shows the same three agent loops as live traces. The demo uses
> reproducible synthetic evidence, but the contract can later accept read-only
> release, provenance, and evaluation adapters. ProofGate provides evidence
> before action—never action without a human.

## Screenshots for the submission

Place final images in `docs/assets/` with these exact names:

1. `control-room-ready.png` — the full `READY_FOR_HUMAN` result, all three agent
   cards, the case digest, and `overlap verified` visible.
2. `control-room-blocked.png` — the `BLOCKED` result with the experiment reason
   visible.
3. `event-ledger.png` — a closer crop of the expanded interleaved ledger.
4. `mozaik-cloud-concurrency.png` — the Cloud Agents view showing all three live
   agent definitions and their loops, with any account details or keys cropped out.
5. `mozaik-cloud-agent-details.png` — an optional Cloud detail view showing one
   agent's restricted instruction, tool, and synthetic context.

Prefer PNG or WebP, use a 16:9 aspect ratio where practical, and keep each image
below roughly 1.5 MB. Do not include credentials, project keys, email addresses,
private repository names, or unrelated browser chrome.

After the images are added, place the ready screenshot directly below the
opening description in the root README. Use the blocked and Cloud screenshots
as a compact two-image demo section, or attach them directly to the hackathon
submission.
