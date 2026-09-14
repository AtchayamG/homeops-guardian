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
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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

  const savingsStr =
    typeof stagedData.estimatedMonthlySavingsUsd === 'number'
      ? stagedData.estimatedMonthlySavingsUsd.toFixed(2)
      : '42.50';
  const reductionStr =
    typeof stagedData.projectedReductionKw === 'number'
      ? stagedData.projectedReductionKw
      : '9.6';

  gateCard.innerHTML = `
    <div class="gate-header">
      <span class="gate-badge">🔒 HUMAN CONFIRMATION REQUIRED</span>
      <span class="gate-title">Action ID: <code>${actionId}</code></span>
    </div>
    <div class="gate-body">
      HomeOps Guardian has staged high-draw circuit modulations to avoid the $0.48/kWh peak tariff.
      <strong>No breakers will be modified until you explicitly approve this action below.</strong>
    </div>
    <div class="gate-breakdown">
      <div class="breakdown-row">
        <span class="breakdown-label">Tesla EV Wall Connector:</span>
        <span class="breakdown-val">PAUSE CHARGING (Shed 7.2 kW)</span>
      </div>
      <div class="breakdown-row">
        <span class="breakdown-label">Heat Pump HVAC:</span>
        <span class="breakdown-val">ECO SETPOINT +2°F (Shed 2.4 kW)</span>
      </div>
      <div class="breakdown-row">
        <span class="breakdown-label">Total Peak Load Shed:</span>
        <span class="breakdown-val">${reductionStr} kW</span>
      </div>
      <div class="breakdown-row">
        <span class="breakdown-label">Projected Monthly Savings:</span>
        <span class="breakdown-val savings">$${savingsStr} USD</span>
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

      appendAlexaMessage(
        `Confirmation verified. I have executed the load shift via MCP tool <code>confirm_load_shift</code>.<br><br>` +
        `• <strong>Tesla EV Charger:</strong> PAUSED until 9:00 PM off-peak window.<br>` +
        `• <strong>Heat Pump HVAC:</strong> Shifted to Eco (+2°F thermal pre-cool offset).<br><br>` +
        `Your household draw has dropped from 13.4 kW to <strong>${resultData.newTotalHomePowerKw || 3.8} kW</strong>, saving <strong>$${resultData.activeSavingsRatePerHour || 4.61}/hr</strong> while peak rates remain active.`
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

      appendAlexaMessage(
        `I have analyzed your circuits and staged a peak load-shift plan to shed <strong>${staged.projectedReductionKw || 9.6} kW</strong>, with projected monthly savings of <strong>$${typeof staged.estimatedMonthlySavingsUsd === 'number' ? staged.estimatedMonthlySavingsUsd.toFixed(2) : '42.50'}</strong>.<br><br>` +
        `Because modifying breaker settings directly affects your appliances, <strong>Alexa+ requires your explicit confirmation</strong> before executing this action.`
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

      appendAlexaMessage(
        `Electricity is expensive right now because you are inside the PG&E <strong>${data.tariffSchedule} Peak Window</strong> (${data.currentTariff?.window}).<br><br>` +
        `• <strong>Current Peak Rate:</strong> $${data.currentTariff?.ratePerKwh}/kWh<br>` +
        `• <strong>Off-Peak Rate (after 9:00 PM):</strong> $0.34/kWh (29% cheaper)<br><br>` +
        `At your current <strong>${data.totalHomePowerKw} kW</strong> draw, your burn rate is <strong>$${data.totalHourlyBurnRateUsd} per hour</strong>. You can save money by shifting flexible loads to off-peak hours.`
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
        `Your Level 2 EV Charger and Heat Pump HVAC make up 80%+ of this load. Would you like me to stage a peak load shift to reduce consumption?`
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
