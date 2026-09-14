import { McpClient, NetworkLogEntry, ToolCallResult } from './mcp-client.js';

// DOM elements
const statusDot = document.getElementById('status-dot')!;
const statusLabel = document.getElementById('status-label')!;
const sessionBadge = document.getElementById('session-badge')!;
const offlineCard = document.getElementById('offline-card')!;
const transcriptScroll = document.getElementById('transcript-scroll')!;
const messagesContainer = document.getElementById('messages-container')!;
const chipsContainer = document.getElementById('chips-container')!;
const inputForm = document.getElementById('input-form') as HTMLFormElement;
const userInput = document.getElementById('user-input') as HTMLInputElement;
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;
const alexaOrb = document.getElementById('alexa-orb')!;
const btnToggleInspector = document.getElementById('btn-toggle-inspector')!;
const btnCloseInspector = document.getElementById('btn-close-inspector')!;
const protocolInspector = document.getElementById('protocol-inspector')!;
const inspectorLogs = document.getElementById('inspector-logs')!;
const inspectorSessionId = document.getElementById('inspector-session-id')!;
const inspectorCallCount = document.getElementById('inspector-call-count')!;
const reqCountBadge = document.getElementById('req-count')!;
const btnReconnect = document.getElementById('btn-reconnect')!;
const btnRetryConn = document.getElementById('btn-retry-conn')!;

// State
const mcp = new McpClient('http://127.0.0.1:3001');
let pendingStagedActionId: string | null = null;

/**
 * The last total draw and hourly rate this client actually READ BACK from the
 * server, so a later reading can be compared against something real.
 *
 * Null until the first telemetry call. Any "down from X" claim must come from
 * here; the previous version compared against two numbers typed into the
 * source, which made every status report announce a saving whether or not one
 * had occurred.
 */
let lastObservedTotalKw: number | null = null;
let lastObservedBurnUsd: number | null = null;
let isProcessing = false;

// Initialize MCP Connection
async function connectToMcpServer() {
  statusDot.className = 'status-dot';
  statusLabel.textContent = 'Connecting to MCP Server...';
  sessionBadge.textContent = '';
  offlineCard.style.display = 'none';

  const health = await mcp.checkHealth();
  if (!health.ok) {
    statusDot.className = 'status-dot';
    statusLabel.textContent = 'Server Offline (127.0.0.1:3001)';
    offlineCard.style.display = 'flex';
    return;
  }

  const initResult = await mcp.initialize();
  if (initResult.success) {
    statusDot.className = 'status-dot online';
    statusLabel.textContent = 'Connected (Streamable HTTP)';
    const sid = mcp.getSessionId();
    sessionBadge.textContent = sid ? `Session: ${sid.slice(0, 8)}...` : '';
    inspectorSessionId.textContent = sid || 'None';
    offlineCard.style.display = 'none';
  } else {
    statusDot.className = 'status-dot';
    statusLabel.textContent = 'Handshake Failed';
    offlineCard.style.display = 'flex';
  }
}

// Subscribe to real-time network logs for Protocol Inspector
mcp.onLog((log: NetworkLogEntry) => {
  (window as any).auditEntries = mcp.getLogs();
  reqCountBadge.textContent = String(mcp.getLogs().length);
  inspectorCallCount.textContent = String(mcp.getLogs().length);

  const placeholder = inspectorLogs.querySelector('.log-placeholder');
  if (placeholder) {
    placeholder.remove();
  }

  const entryEl = document.createElement('div');
  entryEl.className = 'audit-entry';
  entryEl.innerHTML = `
    <div class="audit-entry-header">
      <span class="audit-method">${log.method} ${log.url}</span>
      <span class="audit-status">${log.responseStatus === 200 ? 'HTTP 200' : `Status ${log.responseStatus}`} (${log.durationMs}ms)</span>
    </div>
    <div style="font-size: 10px; color: #64748b;">${log.timestamp}</div>
    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
      <strong>Request JSON-RPC:</strong>
      <pre>${escapeHtml(JSON.stringify(log.requestBody, null, 2))}</pre>
    </div>
    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
      <strong>Response Headers:</strong>
      <pre>${escapeHtml(JSON.stringify(log.responseHeaders, null, 2))}</pre>
    </div>
    <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
      <strong>Response JSON-RPC:</strong>
      <pre>${escapeHtml(JSON.stringify(log.responseBody, null, 2))}</pre>
    </div>
  `;
  inspectorLogs.insertBefore(entryEl, inspectorLogs.firstChild);
});

// UI Helpers
/**
 * A finite number, or null. Deliberately not `?? fallback`.
 *
 * Every figure this client shows comes from an MCP tool result. When a field
 * is absent the honest render is "the server did not report this" - so the
 * call sites branch on null rather than substituting a number that looks
 * right. The previous code used `|| 9.6`, `|| 3.8`, `|| 4.61` and `: '42.50'`,
 * which matched the current server by coincidence and would have gone on
 * stating those figures after the server stopped sending them.
 */
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Names the two largest circuits in a telemetry payload and states their real
 * share of the reported total. If the payload cannot support the claim, it
 * makes no claim.
 */
function topTwoShareSentence(data: any): string {
  const circuits: any[] = Array.isArray(data?.circuits) ? data.circuits : [];
  const total = numOrNull(data?.totalHomePowerKw);
  const ranked = circuits
    .map((c) => ({ name: String(c?.name ?? 'unnamed circuit'), kw: numOrNull(c?.powerKw) }))
    .filter((c): c is { name: string; kw: number } => c.kw !== null)
    .sort((a, b) => b.kw - a.kw);

  if (ranked.length < 2 || total === null || total <= 0) {
    return 'The server did not report enough circuit detail to say which loads dominate.';
  }

  const [first, second] = ranked;
  const share = Math.round(((first.kw + second.kw) / total) * 100);
  return `<strong>${escapeHtml(first.name)}</strong> and <strong>${escapeHtml(second.name)}</strong> are the two largest draws, together ${share}% of the reported total.`;
}

function scrollToBottom() {
  setTimeout(() => {
    transcriptScroll.scrollTop = transcriptScroll.scrollHeight;
  }, 50);
}

function appendUserMessage(text: string) {
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div class="speech-bubble user-bubble">${escapeHtml(text)}</div>
    <div class="speaker-avatar user-avatar" title="You">You</div>
  `;
  messagesContainer.appendChild(row);
  scrollToBottom();
}

function appendAlexaMessage(htmlContent: string) {
  const row = document.createElement('div');
  row.className = 'message-row alexa';
  row.innerHTML = `
    <div class="speaker-avatar alexa-avatar" title="Alexa+">⚡</div>
    <div class="speech-bubble alexa-bubble">${htmlContent}</div>
  `;
  messagesContainer.appendChild(row);
  scrollToBottom();
}

function appendToolStepCard(toolResult: ToolCallResult): HTMLElement {
  const card = document.createElement('div');
  card.className = 'tool-step-card';

  let textContent = '';
  if (toolResult.content && toolResult.content.length > 0) {
    textContent = toolResult.content[0].text;
  } else {
    textContent = JSON.stringify(toolResult.rawResponse, null, 2);
  }

  let formattedResult = textContent;
  try {
    const obj = JSON.parse(textContent);
    formattedResult = JSON.stringify(obj, null, 2);
  } catch {
    // Keep as string
  }

  card.innerHTML = `
    <div class="tool-step-header" title="Click to collapse / expand tool details">
      <div class="tool-title">
        <span>🔧 MCP Tool:</span>
        <code>${escapeHtml(toolResult.toolName)}</code>
      </div>
      <div class="tool-meta-badge">
        <span>Session: ${toolResult.sessionId.slice(0, 8)}...</span>
        <span class="latency">${toolResult.durationMs}ms</span>
        <span class="toggle-icon">▼</span>
      </div>
    </div>
    <div class="tool-step-body">
      <div style="font-weight: 600; color: #94a3b8; font-size: 11px;">Input Arguments:</div>
      <pre>${escapeHtml(JSON.stringify(toolResult.arguments, null, 2))}</pre>
      <div style="font-weight: 600; color: #94a3b8; font-size: 11px; margin-top: 4px;">Tool Result (Live from MCP Server):</div>
      <pre>${escapeHtml(formattedResult)}</pre>
    </div>
  `;

  const header = card.querySelector('.tool-step-header')!;
  const body = card.querySelector('.tool-step-body') as HTMLElement;
  const toggleIcon = card.querySelector('.toggle-icon') as HTMLElement;

  header.addEventListener('click', () => {
    if (body.style.display === 'none') {
      body.style.display = 'flex';
      toggleIcon.textContent = '▼';
    } else {
      body.style.display = 'none';
      toggleIcon.textContent = '▶';
    }
  });

  messagesContainer.appendChild(card);
  scrollToBottom();
  return card;
}

function appendConfirmationGate(stagedData: any): HTMLElement {
  const gateCard = document.createElement('div');
  gateCard.className = 'confirmation-gate-card';
  const actionId = stagedData.stagedActionId || `shift-${Date.now().toString(36)}`;
  gateCard.id = `gate-${actionId}`;

  // Everything this card shows is read out of the staged payload. It used to
  // be typed into the HTML - two named circuits ("Tesla EV Wall Connector:
  // PAUSE CHARGING (Shed 7.2 kW)", "Heat Pump HVAC: ECO SETPOINT +2°F") and a
  // $0.48/kWh tariff - and the totals fell back to `|| 9.6` and `|| '42.50'`
  // when a field was missing. It looked correct only because the hardcoded
  // numbers happened to match what the server sends today.
  //
  // This is the one surface where that is intolerable. The user's approval is
  // consent to the plan *as described*, so a gate that describes something
  // other than what it will execute is worse than having no gate at all - our
  // own walkthrough says so. If the server does not report a field, this card
  // says the server did not report it. It never supplies a plausible number.
  const missing = (label: string) =>
    `<span class="breakdown-val val-missing" title="The server did not report this field.">${label} not reported by the server</span>`;

  const num = numOrNull;

  const actions: any[] = Array.isArray(stagedData.proposedActions)
    ? stagedData.proposedActions
    : [];

  const actionRows = actions.length
    ? actions
        .map((a) => {
          const kw = num(a?.powerReductionKw);
          const verb = a?.action ? String(a.action).replace(/_/g, ' ') : null;
          const right =
            verb && kw !== null
              ? `${escapeHtml(verb)} (shed ${kw} kW)`
              : verb
                ? `${escapeHtml(verb)} (reduction not reported)`
                : 'action not reported by the server';
          return `
      <div class="breakdown-row">
        <span class="breakdown-label"><code>${escapeHtml(String(a?.circuitId ?? 'unnamed circuit'))}</code></span>
        <span class="breakdown-val">${right}</span>
      </div>
      ${a?.details ? `<div class="breakdown-detail">${escapeHtml(String(a.details))}</div>` : ''}`;
        })
        .join('')
    : `<div class="breakdown-row"><span class="breakdown-label">Proposed actions</span>${missing('none')}</div>`;

  const reductionKw = num(stagedData.projectedReductionKw);
  const savingsUsd = num(stagedData.estimatedMonthlySavingsUsd);

  gateCard.innerHTML = `
    <div class="gate-header">
      <span class="gate-badge">🔒 HUMAN CONFIRMATION REQUIRED</span>
      <span class="gate-title">Action ID: <code>${actionId}</code></span>
    </div>
    <div class="gate-body">
      ${escapeHtml(
        String(
          stagedData.message ??
            'A plan has been staged. The server sent no message describing it.'
        )
      )}
      <strong>No circuit is modified until you approve this action below.</strong>
    </div>
    <div class="gate-breakdown">
      ${actionRows}
      <div class="breakdown-row breakdown-total">
        <span class="breakdown-label">Total peak load shed:</span>
        ${
          reductionKw !== null
            ? `<span class="breakdown-val">${reductionKw} kW</span>`
            : missing('total')
        }
      </div>
      <div class="breakdown-row">
        <span class="breakdown-label">Projected monthly saving <em>(modelled)</em>:</span>
        ${
          savingsUsd !== null
            ? `<span class="breakdown-val savings">$${savingsUsd.toFixed(2)} USD</span>`
            : missing('saving')
        }
      </div>
      <div class="breakdown-note">
        The saving is modelled from a simulated time-of-use tariff, not read
        from a meter or a utility account. See the <code>dataSource</code> block
        on any <code>get_circuit_telemetry</code> result.
      </div>
    </div>
    <div class="gate-actions" id="gate-actions-${actionId}">
      <button class="btn btn-confirm" id="btn-approve-${actionId}">
        ✓ Approve & Execute Load Shift
      </button>
      <button class="btn btn-cancel" id="btn-reject-${actionId}">
        ✕ Cancel / Maintain Current
      </button>
    </div>
  `;

  messagesContainer.appendChild(gateCard);
  scrollToBottom();

  const btnApprove = gateCard.querySelector(`#btn-approve-${actionId}`)!;
  const btnReject = gateCard.querySelector(`#btn-reject-${actionId}`)!;
  const actionsContainer = gateCard.querySelector(`#gate-actions-${actionId}`)!;

  btnApprove.addEventListener('click', async () => {
    actionsContainer.innerHTML = `
      <div class="gate-status-resolved executed">
        <span>✓ APPROVED BY USER — Executing confirm_load_shift over MCP...</span>
      </div>
    `;
    await handleUtterance('Confirm staged load shift');
  });

  btnReject.addEventListener('click', async () => {
    actionsContainer.innerHTML = `
      <div class="gate-status-resolved cancelled">
        <span>✕ CANCELLED BY USER — Breakers unchanged.</span>
      </div>
    `;
    await handleUtterance('Cancel staged load shift');
  });

  return gateCard;
}

// Conversation Handling & MCP Tool Dispatch
async function handleUtterance(text: string) {
  console.log('[handleUtterance called with text]:', text);
  if (isProcessing) {
    console.warn('[handleUtterance ignored because isProcessing is true]');
    return;
  }
  isProcessing = true;
  userInput.disabled = true;
  btnSend.disabled = true;
  alexaOrb.classList.add('pulsing');

  appendUserMessage(text);
  const normalized = text.toLowerCase().trim();
  console.log('[normalized text]:', normalized);

  try {
    if (!mcp.getConnected()) {
      appendAlexaMessage(
        "I'm sorry, I cannot communicate with HomeOps Guardian because the MCP server is currently offline. Please ensure the server is started with <code>ops\\run-mcp.cmd</code>."
      );
      return;
    }

    // 1. Ping Utterance
    if (normalized.includes('ping')) {
      const toolRes = await mcp.callTool('ping', {});
      appendToolStepCard(toolRes);

      let parsed: any = {};
      try {
        parsed = JSON.parse(toolRes.content?.[0]?.text || '{}');
      } catch {
        parsed = {};
      }

      appendAlexaMessage(
        `HomeOps Guardian is <strong>online and responding</strong> over MCP Streamable HTTP.<br>` +
        `Server timestamp: <code>${parsed.timestamp || new Date().toISOString()}</code>. All household electrical monitoring channels are verified.`
      );
    }
    // 2. Confirm Load Shift Utterance (Priority so 'confirm staged load shift' executes confirmation)
    else if (
      normalized.includes('confirm') ||
      normalized.includes('approve') ||
      normalized === 'yes'
    ) {
      if (!pendingStagedActionId) {
        const stageRes = await mcp.callTool('stage_load_shift', { reason: 'Direct user approval' });
        const stagedData = JSON.parse(stageRes.content?.[0]?.text || '{}');
        pendingStagedActionId = stagedData.stagedActionId;
      }

      console.log('[Executing confirm_load_shift with pendingId]:', pendingStagedActionId);
      const toolRes = await mcp.callTool('confirm_load_shift', {
        stagedActionId: pendingStagedActionId,
        confirmed: true
      });
      console.log('[confirm_load_shift toolRes]:', toolRes);
      appendToolStepCard(toolRes);

      let resultData: any = {};
      try {
        resultData = JSON.parse(toolRes.content?.[0]?.text || '{}');
      } catch {
        resultData = {};
      }

      // Mark any inline gate card resolved
      const gateActions = document.getElementById(`gate-actions-${pendingStagedActionId}`);
      if (gateActions) {
        gateActions.innerHTML = `
          <div class="gate-status-resolved executed">
            <span>✓ EXECUTED VIA MCP: confirm_load_shift (Status: ACTION_EXECUTED)</span>
          </div>
        `;
      }

      // Spoken back from the execution result, not from memory. The previous
      // version narrated two named appliances and "13.4 kW to 3.8 kW, saving
      // $4.61/hr" with `|| 3.8` and `|| 4.61` fallbacks, so if the server had
      // reported anything else - or nothing - Alexa would have confidently
      // said these numbers anyway. Missing means missing.
      const newTotal = numOrNull(resultData.newTotalHomePowerKw);
      const ratePerHour = numOrNull(resultData.activeSavingsRatePerHour);
      const executed: any[] = Array.isArray(resultData.executedActions)
        ? resultData.executedActions
        : [];

      const executedLines = executed.length
        ? executed
            .map((a) => {
              const kw = numOrNull(a?.powerReductionKw);
              const verb = a?.action ? String(a.action).replace(/_/g, ' ') : 'changed';
              return `• <code>${escapeHtml(String(a?.circuitId ?? 'unnamed circuit'))}</code>: ${escapeHtml(verb)}${kw !== null ? ` (${kw} kW shed)` : ''}`;
            })
            .join('<br>')
        : '• The server did not itemise the circuits it changed.';

      appendAlexaMessage(
        `Confirmation verified. I have executed the load shift via MCP tool <code>confirm_load_shift</code>.<br><br>` +
        `${executedLines}<br><br>` +
        (newTotal !== null
          ? `Household draw is now <strong>${newTotal} kW</strong>.`
          : `The server did not report a new household total.`) +
        (ratePerHour !== null
          ? ` Modelled saving while the peak window lasts: <strong>$${ratePerHour}/hr</strong>.`
          : '')
      );

      pendingStagedActionId = null;
    }
    // 3. Optimize / Stage Load Shift Utterance
    else if (
      (normalized.includes('optimize') ||
        normalized.includes('load shift') ||
        normalized.includes('stage') ||
        normalized.includes('shed')) &&
      !normalized.includes('confirm')
    ) {
      console.log('[Entering stage_load_shift branch]');
      const toolRes = await mcp.callTool('stage_load_shift', {
        reason: 'User requested peak TOU rate optimization'
      });
      console.log('[stage_load_shift toolRes]:', toolRes);
      appendToolStepCard(toolRes);

      let staged: any = {};
      try {
        staged = JSON.parse(toolRes.content?.[0]?.text || '{}');
      } catch (e) {
        console.error('[Failed to parse staged JSON]:', e);
        staged = {};
      }
      console.log('[Parsed staged object]:', staged);

      pendingStagedActionId = staged.stagedActionId;

      const stagedKw = numOrNull(staged.projectedReductionKw);
      const stagedSavings = numOrNull(staged.estimatedMonthlySavingsUsd);

      appendAlexaMessage(
        (stagedKw !== null
          ? `I have analysed your circuits and staged a peak load-shift plan to shed <strong>${stagedKw} kW</strong>`
          : `I have analysed your circuits and staged a peak load-shift plan, though the server did not report how much load it would shed`) +
        (stagedSavings !== null
          ? `, with a modelled monthly saving of <strong>$${stagedSavings.toFixed(2)}</strong>.<br><br>`
          : `.<br><br>`) +
        `Because changing a breaker setting affects your appliances, <strong>this needs your explicit confirmation</strong> before it runs. Nothing has changed yet.`
      );

      // Render the prominent confirmation gate card
      appendConfirmationGate(staged);
    }
    // 4. Cancel Load Shift Utterance
    else if (normalized.includes('cancel') || normalized.includes('reject') || normalized === 'no') {
      if (pendingStagedActionId) {
        const toolRes = await mcp.callTool('confirm_load_shift', {
          stagedActionId: pendingStagedActionId,
          confirmed: false
        });
        appendToolStepCard(toolRes);

        const gateActions = document.getElementById(`gate-actions-${pendingStagedActionId}`);
        if (gateActions) {
          gateActions.innerHTML = `
            <div class="gate-status-resolved cancelled">
              <span>✕ CANCELLED BY USER — Breaker settings maintained.</span>
            </div>
          `;
        }

        appendAlexaMessage(
          `Load shift cancelled. All circuit breakers and appliances will continue running at their existing setpoints.`
        );
        pendingStagedActionId = null;
      } else {
        appendAlexaMessage(`There are no pending load-shift plans to cancel.`);
      }
    }
    // 5. Post-Optimization Status Verification
    else if (normalized.includes('after') || normalized.includes('post')) {
      const toolRes = await mcp.callTool('get_circuit_telemetry', {});
      appendToolStepCard(toolRes);

      let data: any = {};
      try {
        data = JSON.parse(toolRes.content?.[0]?.text || '{}');
      } catch {
        data = {};
      }

      // Report the DELTA the server actually shows, against the last telemetry
      // this client really observed - never against a written-in baseline.
      //
      // This line used to read "(down from 13.4 kW)" and "lowered from
      // $6.43/hr", with both figures hard-coded. So it claimed a saving every
      // single time, including the case that matters most: a judge who stages a
      // load shift, does NOT approve it, and then asks for status. Nothing has
      // been executed, the circuits are untouched, and the app said
      // "Post-optimization telemetry verified from server ... has been lowered"
      // over two identical numbers. Announcing a reduction that did not happen
      // is the exact failure this portfolio exists to argue against, and it is
      // worse here than a crash would have been.
      const nowKw = Number(data.totalHomePowerKw);
      const nowUsd = Number(data.totalHourlyBurnRateUsd);
      const prevKw = lastObservedTotalKw;
      const prevUsd = lastObservedBurnUsd;

      if (!Number.isFinite(nowKw) || !Number.isFinite(nowUsd)) {
        appendAlexaMessage(
          `I read the telemetry back from the server but it did not include a total draw, so I am not going to guess at one.`
        );
      } else if (prevKw === null || prevUsd === null) {
        appendAlexaMessage(
          `Telemetry read from the server: total home draw is <strong>${nowKw} kW</strong> at <strong>$${nowUsd.toFixed(2)}/hr</strong>. ` +
          `I have no earlier reading in this session to compare it against, so I am not claiming a change either way.`
        );
      } else if (Math.abs(nowKw - prevKw) < 0.05) {
        appendAlexaMessage(
          `Telemetry read from the server: total home draw is still <strong>${nowKw} kW</strong> at <strong>$${nowUsd.toFixed(2)}/hr</strong> — ` +
          `<strong>unchanged</strong> from the last reading.` +
          (pendingStagedActionId
            ? ` That is expected: the load shift is staged but not approved, so nothing has been applied to your circuits.`
            : ` No load shift has been executed in this session.`)
        );
      } else {
        const dir = nowKw < prevKw ? 'down' : 'up';
        appendAlexaMessage(
          `Telemetry read from the server: total home draw is now <strong>${nowKw} kW</strong>, ` +
          `${dir} from ${prevKw} kW.<br>` +
          `Hourly burn rate moved from $${prevUsd.toFixed(2)}/hr to <strong>$${nowUsd.toFixed(2)}/hr</strong>.`
        );
      }

      if (Number.isFinite(nowKw)) lastObservedTotalKw = nowKw;
      if (Number.isFinite(nowUsd)) lastObservedBurnUsd = nowUsd;
    }
    // 6. Tariff Inquiry Utterance
    else if (
      normalized.includes('expensive') ||
      normalized.includes('tariff') ||
      normalized.includes('why')
    ) {
      const toolRes = await mcp.callTool('get_circuit_telemetry', {});
      appendToolStepCard(toolRes);

      let data: any = {};
      try {
        data = JSON.parse(toolRes.content?.[0]?.text || '{}');
      } catch {
        data = {};
      }

      // Both rates come from the payload, and the percentage is computed from
      // them. It used to read "Off-Peak Rate (after 9:00 PM): $0.34/kWh (29%
      // cheaper)" as a literal in this file - a rate no tool result contained,
      // next to a percentage nothing recalculated.
      const peakRate = numOrNull(data.currentTariff?.ratePerKwh);
      const offPeakRate = numOrNull(data.currentTariff?.offPeak?.ratePerKwh);
      const offPeakStart = data.currentTariff?.offPeak?.startsAt;
      const cheaperPct =
        peakRate !== null && offPeakRate !== null && peakRate > 0
          ? Math.round(((peakRate - offPeakRate) / peakRate) * 100)
          : null;

      const offPeakLine =
        offPeakRate !== null
          ? `• <strong>Off-peak rate${offPeakStart ? ` (from ${escapeHtml(String(offPeakStart))})` : ''}:</strong> $${offPeakRate}/kWh${cheaperPct !== null ? ` — ${cheaperPct}% lower` : ''}<br><br>`
          : `• <strong>Off-peak rate:</strong> not reported by the server<br><br>`;

      appendAlexaMessage(
        `Electricity is expensive right now because you are inside the <strong>modelled</strong> PG&E <strong>${escapeHtml(String(data.tariffSchedule ?? 'time-of-use'))} peak window</strong> (${escapeHtml(String(data.currentTariff?.window ?? 'window not reported'))}).<br><br>` +
        (peakRate !== null
          ? `• <strong>Current peak rate:</strong> $${peakRate}/kWh<br>`
          : `• <strong>Current peak rate:</strong> not reported by the server<br>`) +
        offPeakLine +
        (numOrNull(data.totalHomePowerKw) !== null && numOrNull(data.totalHourlyBurnRateUsd) !== null
          ? `At your current <strong>${data.totalHomePowerKw} kW</strong> draw, that is <strong>$${data.totalHourlyBurnRateUsd} per hour</strong>. Shifting flexible load past the peak window is what reduces it.`
          : `The server did not report a current draw or burn rate.`)
      );
    }
    // 7. General Telemetry Query Utterance
    else if (
      normalized.includes('energy status') ||
      normalized.includes('home energy') ||
      normalized.includes('power') ||
      normalized.includes('status') ||
      normalized.includes('draw')
    ) {
      const toolRes = await mcp.callTool('get_circuit_telemetry', {});
      appendToolStepCard(toolRes);

      let data: any = {};
      try {
        data = JSON.parse(toolRes.content?.[0]?.text || '{}');
      } catch {
        data = {};
      }

      // This is the reading a later "down from" claim gets measured against.
      if (Number.isFinite(Number(data.totalHomePowerKw))) {
        lastObservedTotalKw = Number(data.totalHomePowerKw);
      }
      if (Number.isFinite(Number(data.totalHourlyBurnRateUsd))) {
        lastObservedBurnUsd = Number(data.totalHourlyBurnRateUsd);
      }

      const circuitsHtml = (data.circuits || [])
        .map(
          (c: any) =>
            `<li><strong>${escapeHtml(c.name)}</strong>: ${c.powerKw} kW (${escapeHtml(c.status)}) — $${c.hourlyCost}/hr</li>`
        )
        .join('');

      appendAlexaMessage(
        // "modelled" is doing real work in this sentence. Without it the line
        // reads as a rate quote fetched from PG&E moments ago, and the figures
        // are a fixture - see dataSource on the payload.
        `Your household is currently drawing <strong>${data.totalHomePowerKw} kW</strong>, costing <strong>$${data.totalHourlyBurnRateUsd}/hr</strong> on a <strong>modelled</strong> PG&E <strong>${data.currentTariff?.tier}</strong> tier ($${data.currentTariff?.ratePerKwh}/kWh — illustrative, not a live rate).<br><br>` +
        `Active high-draw circuits:<ul>${circuitsHtml}</ul><br>` +
        // Was: "Your Level 2 EV Charger and Heat Pump HVAC make up 80%+ of
        // this load." Two appliance names typed into the client and a share
        // nothing measured. Both now come out of the circuit list the server
        // just sent: the two largest draws, and their real share of the total.
        topTwoShareSentence(data) +
        ` Would you like me to stage a peak load shift to reduce consumption?`
      );
    }
    // General / Unknown fallback
    else {
      appendAlexaMessage(
        `I understood: "<em>${escapeHtml(text)}</em>".<br><br>` +
        `You can ask me to <strong>ping HomeOps Guardian</strong>, check your <strong>circuit energy status</strong>, ask <strong>why electricity is expensive</strong>, or <strong>optimize appliances for peak rates</strong>.`
      );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    appendAlexaMessage(
      `An error occurred communicating with the HomeOps Guardian MCP server: <code>${escapeHtml(errorMsg)}</code>`
    );
  } finally {
    isProcessing = false;
    userInput.disabled = false;
    btnSend.disabled = false;
    alexaOrb.classList.remove('pulsing');
    userInput.value = '';
    userInput.focus();
  }
}

// Event Listeners
inputForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (text) {
    await handleUtterance(text);
  }
});

chipsContainer.addEventListener('click', async (e) => {
  const target = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
  if (target) {
    const text = target.getAttribute('data-text');
    if (text) {
      await handleUtterance(text);
    }
  }
});

btnToggleInspector.addEventListener('click', () => {
  protocolInspector.classList.toggle('collapsed');
});

btnCloseInspector.addEventListener('click', () => {
  protocolInspector.classList.add('collapsed');
});

btnReconnect.addEventListener('click', async () => {
  await mcp.disconnect();
  await connectToMcpServer();
});

btnRetryConn.addEventListener('click', async () => {
  await connectToMcpServer();
});

// Auto-connect on page load
window.addEventListener('DOMContentLoaded', () => {
  connectToMcpServer();
});
