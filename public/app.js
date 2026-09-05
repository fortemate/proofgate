const roles = ['build', 'policy', 'experiment'];
const roleLabels = {
  build: 'Build integrity',
  policy: 'Release policy',
  experiment: 'Experiment safety',
};

const scenarios = document.querySelectorAll('.scenario');
const runButton = document.querySelector('#run-button');
const runLabel = document.querySelector('#run-label');
const runState = document.querySelector('#run-state');
const resultPanel = document.querySelector('#result');
let selectedFixture = 'ready';

for (const scenario of scenarios) {
  scenario.addEventListener('click', () => {
    if (runButton.disabled) return;
    selectedFixture = scenario.dataset.fixture;
    for (const candidate of scenarios) {
      candidate.classList.toggle('selected', candidate === scenario);
    }
  });
}

runButton.addEventListener('click', async () => {
  setRunning(true);
  showPendingAgents();

  try {
    const response = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixture: selectedFixture }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Evaluation failed');
    renderResult(payload);
    runState.textContent = 'Evaluation complete';
  } catch (error) {
    resultPanel.hidden = true;
    runState.textContent =
      error instanceof Error ? error.message : 'Evaluation failed';
  } finally {
    setRunning(false);
  }
});

function setRunning(running) {
  runButton.disabled = running;
  for (const scenario of scenarios) scenario.disabled = running;
  runButton.classList.toggle('running', running);
  runLabel.textContent = running
    ? 'Agents collecting evidence'
    : 'Run concurrent evaluation';
  if (running) runState.textContent = 'Three loops in flight…';
}

function showPendingAgents() {
  resultPanel.hidden = false;
  resultPanel.className = 'result pending';
  document.querySelector('#verdict').textContent = 'EVALUATING';
  document.querySelector('#case-id').textContent = selectedFixture;
  document.querySelector('#digest').textContent = 'binding proof case…';
  document.querySelector('#reasons').hidden = true;
  document.querySelector('#concurrency').textContent = 'starting loops';
  document.querySelector('#event-count').textContent = 'collecting events';
  document.querySelector('#timeline').replaceChildren();

  const cards = roles.map((role) => createAgentCard(role));
  document.querySelector('#agents').replaceChildren(...cards);
}

function createAgentCard(role, observation, loopId, failure) {
  const card = document.createElement('article');
  let visualStatus = 'working';
  if (observation) visualStatus = observation.status.toLowerCase();
  else if (failure) visualStatus = 'fail';
  card.className = `agent-card ${visualStatus}`;

  const ordinal = String(roles.indexOf(role) + 1).padStart(2, '0');
  const status = observation?.status ?? (failure ? 'ERROR' : 'RUNNING');
  const summary =
    observation?.summary ??
    failure ??
    'Inspecting the synthetic evidence source…';
  const check =
    observation?.check ??
    (failure ? 'evidence unavailable' : `${role} evidence`);

  card.innerHTML = `
    <div class="agent-topline">
      <span>Agent ${ordinal}</span>
      <span class="agent-status">${escapeHtml(status)}</span>
    </div>
    <h4>${escapeHtml(roleLabels[role])}</h4>
    <p>${escapeHtml(summary)}</p>
    <div class="agent-foot">
      <span>${escapeHtml(check)}</span>
      <code>${escapeHtml(shortLoop(loopId))}</code>
    </div>
  `;
  return card;
}

function renderResult(result) {
  const isReady = result.verdict.status === 'READY_FOR_HUMAN';
  resultPanel.hidden = false;
  resultPanel.className = `result ${isReady ? 'ready' : 'blocked'}`;
  document.querySelector('#verdict').textContent = result.verdict.status;
  document.querySelector('#case-id').textContent = result.fixture;
  document.querySelector('#digest').textContent = shortDigest(
    result.verdict.caseDigest,
  );
  document.querySelector('#concurrency').textContent =
    result.concurrencyObserved ? 'overlap verified' : 'overlap not verified';

  const reasons = document.querySelector('#reasons');
  reasons.hidden = result.verdict.reasons.length === 0;
  reasons.replaceChildren(
    ...result.verdict.reasons.map((reason) => {
      const item = document.createElement('p');
      item.textContent = reason;
      return item;
    }),
  );

  const observations = new Map(
    result.verdict.evidence.map((observation) => [
      observation.role,
      observation,
    ]),
  );
  const cards = roles.map((role) => {
    const prefixedReason = result.verdict.reasons.find((reason) =>
      reason.startsWith(`${role}: `),
    );
    const failure = prefixedReason?.slice(role.length + 2);
    return createAgentCard(
      role,
      observations.get(role),
      result.loopIds[role],
      failure,
    );
  });
  document.querySelector('#agents').replaceChildren(...cards);

  const visibleEvents = result.timeline.filter((event) =>
    [
      'case.announced',
      'inference.started',
      'function_call.completed',
      'evidence.observed',
      'participant.failed',
      'participant.completed',
      'gate.updated',
    ].includes(event.type),
  );
  document.querySelector('#event-count').textContent =
    `${result.timeline.length} events`;
  document.querySelector('#timeline').replaceChildren(
    ...visibleEvents.map((event) => {
      const item = document.createElement('li');
      item.innerHTML = `
        <span>${String(event.sequence).padStart(2, '0')}</span>
        <strong>${escapeHtml(event.actor)}</strong>
        <code>${escapeHtml(event.type)}</code>
        <small>${escapeHtml(shortLoop(event.loopId))}</small>
      `;
      return item;
    }),
  );
}

function shortDigest(digest) {
  return `${digest.slice(0, 12)}…${digest.slice(-8)}`;
}

function shortLoop(loopId) {
  if (!loopId || loopId === 'missing') return 'no evidence';
  return `loop ${loopId.slice(0, 8)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
