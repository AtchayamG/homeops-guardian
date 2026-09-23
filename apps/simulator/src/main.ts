const AGENT = 'http://127.0.0.1:3003';
const sessionId = crypto.randomUUID();
const $ = (id: string) => document.getElementById(id)!;
const statusDot = $('status-dot');
const statusLabel = $('status-label');
const offlineCard = $('offline-card');
const messages = $('messages-container');
const trace = $('agent-trace');
const inspector = $('inspector-logs');
const input = $('user-input') as HTMLInputElement;
const send = $('btn-send') as HTMLButtonElement;
const orb = $('alexa-orb');
let busy = false;
let frames = 0;

function escapeHtml(value: unknown): string {
  const node = document.createElement('div');
  node.textContent = String(value);
  return node.innerHTML;
}

function scroll() { $('transcript-scroll').scrollTop = $('transcript-scroll').scrollHeight; }

function message(role: 'user' | 'alexa', text: string) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;
  row.innerHTML = role === 'user'
    ? `<div class="speech-bubble user-bubble">${escapeHtml(text)}</div><div class="speaker-avatar user-avatar">You</div>`
    : `<div class="speaker-avatar alexa-avatar">⚡</div><div class="speech-bubble alexa-bubble">${escapeHtml(text)}</div>`;
  messages.appendChild(row);
  scroll();
}

function traceLine(title: string, detail: unknown) {
  const row = document.createElement('div');
  row.className = 'tool-step-card';
  row.innerHTML = `<strong>${escapeHtml(title)}</strong><pre>${escapeHtml(
    typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)
  )}</pre>`;
  trace.appendChild(row);
  scroll();
}

function frame(direction: string, data: unknown) {
  frames++;
  $('req-count').textContent = String(frames);
  $('inspector-call-count').textContent = String(frames);
  inspector.querySelector('.log-placeholder')?.remove();
  const row = document.createElement('div');
  row.className = 'audit-entry';
  row.innerHTML = `<strong>${escapeHtml(direction)} JSON-RPC</strong><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  inspector.prepend(row);
}

async function confirm(elicitationId: string, approve: boolean, card: HTMLElement) {
  const res = await fetch(`${AGENT}/agent/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ elicitationId, approve })
  });
  card.querySelectorAll('button').forEach(button => { button.disabled = true; });
  const status = card.querySelector('.gate-status')!;
  status.textContent = res.ok
    ? (approve ? 'Approval sent to the server; awaiting verified result.' : 'Declined; awaiting server result.')
    : 'Confirmation could not be delivered; the server will fail closed.';
}

function confirmation(elicitationId: string, serverMessage: string) {
  const card = document.createElement('div');
  card.className = 'confirmation-gate-card';
  // The complete plan and every figure here come from the server elicitation.
  // No figure is reconstructed by this UI if it is not reported by the server.
  card.innerHTML = `<div class="gate-header"><span class="gate-badge">🔒 HUMAN CONFIRMATION REQUIRED</span></div>
    <div class="gate-body"><pre>${escapeHtml(serverMessage || 'Plan not reported by the server')}</pre></div>
    <div class="gate-actions"><button class="btn btn-confirm">Approve plan</button>
    <button class="btn btn-cancel">Decline</button></div><div class="gate-status" aria-live="polite"></div>`;
  card.querySelector('.btn-confirm')!.addEventListener('click', () => void confirm(elicitationId, true, card));
  card.querySelector('.btn-cancel')!.addEventListener('click', () => void confirm(elicitationId, false, card));
  messages.appendChild(card);
  scroll();
}

type Event = { type: string; [key: string]: any };
function handleEvent(event: Event) {
  switch (event.type) {
    case 'planner':
      $('planner-mode').textContent = event.mode;
      if (event.requestId) traceLine('Bedrock request', { modelId: event.modelId, requestId: event.requestId });
      break;
    case 'model_text': traceLine('Model reasoning or response', event.text); break;
    case 'tool_call': traceLine(`Tool call: ${event.name}`, event.args); break;
    case 'tool_result': traceLine(`Tool result: ${event.name}${event.isError ? ' (error)' : ''}`, event.summary); break;
    case 'human_confirmation_required': confirmation(event.elicitationId, event.message); break;
    case 'mcp_frame': frame(event.direction, event.frame); break;
    case 'final': message('alexa', event.text); break;
    case 'agent_unavailable': traceLine('Agent unavailable', event.errorName); break;
  }
}

async function connect() {
  try {
    const response = await fetch(`${AGENT}/health`);
    if (!response.ok) throw new Error('Agent unavailable');
    statusDot.className = 'status-dot online';
    statusLabel.textContent = 'Agent connected';
    offlineCard.style.display = 'none';
    $('session-badge').textContent = 'Agent session active';
    $('inspector-session-id').textContent = 'Managed by agent';
  } catch {
    statusDot.className = 'status-dot';
    statusLabel.textContent = 'Agent offline (127.0.0.1:3003)';
    offlineCard.style.display = 'flex';
  }
}

async function handleUtterance(utterance: string) {
  if (busy) return;
  busy = true;
  input.disabled = true;
  send.disabled = true;
  orb.classList.add('pulsing');
  message('user', utterance);
  try {
    const response = await fetch(`${AGENT}/agent/turn`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, utterance })
    });
    if (!response.ok || !response.body) throw new Error(`Agent returned HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const packet = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = packet.split('\n').find(line => line.startsWith('data: '));
        if (data) handleEvent(JSON.parse(data.slice(6)));
      }
      if (done) break;
    }
  } catch (error) {
    message('alexa', `Agent unavailable: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    busy = false;
    input.disabled = false;
    send.disabled = false;
    orb.classList.remove('pulsing');
    input.value = '';
    input.focus();
  }
}

$('input-form').addEventListener('submit', event => {
  event.preventDefault();
  const utterance = input.value.trim();
  if (utterance) void handleUtterance(utterance);
});
$('chips-container').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest('.chip');
  const utterance = button?.getAttribute('data-text');
  if (utterance) void handleUtterance(utterance);
});
$('btn-toggle-inspector').addEventListener('click', () => $('protocol-inspector').classList.toggle('collapsed'));
$('btn-close-inspector').addEventListener('click', () => $('protocol-inspector').classList.add('collapsed'));
$('btn-reconnect').addEventListener('click', () => void connect());
$('btn-retry-conn').addEventListener('click', () => void connect());
void connect();
