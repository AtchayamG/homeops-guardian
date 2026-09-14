// verify-gate.mjs — prove the human-confirmation gate on the real server.
//
// The gate is the most interesting claim in Project 3, so it gets tested the
// only way that means anything: drive the live server over MCP Streamable HTTP
// and read the circuit state back at each step.
//
//   1. initialize                     -> real MCP-Session-Id
//   2. get_circuit_telemetry          -> BASELINE
//   3. stage_load_shift               -> PENDING_CONFIRMATION + action id
//   4. get_circuit_telemetry          -> MUST BE UNCHANGED. Staging alone
//                                        must not touch a single circuit.
//   5. confirm_load_shift(confirmed)  -> ACTION_EXECUTED
//   6. get_circuit_telemetry          -> MUST NOW DIFFER
//
// Exits non-zero on any failed assertion so ops scripts can gate on it.
const BASE = 'http://127.0.0.1:3001';
let sessionId = null;
let id = 0;

async function rpc(method, params) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  };
  if (sessionId) {
    headers['MCP-Session-Id'] = sessionId;
    headers['MCP-Protocol-Version'] = '2025-11-25';
  }
  const res = await fetch(BASE + '/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
  });
  const sid = res.headers.get('mcp-session-id');
  if (sid && !sessionId) sessionId = sid;
  const body = await res.json();
  if (body.error) throw new Error(method + ' -> ' + JSON.stringify(body.error));
  return { status: res.status, result: body.result };
}

const callTool = async (name, args = {}) => {
  const { result } = await rpc('tools/call', { name, arguments: args });
  return JSON.parse(result.content[0].text);
};

const fail = [];
const check = (label, ok, detail) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (detail ? ' :: ' + detail : ''));
  if (!ok) fail.push(label);
};

const init = await rpc('initialize', {
  protocolVersion: '2025-11-25',
  capabilities: {},
  clientInfo: { name: 'orchestrator-gate-verify', version: '1.0' }
});
console.log('initialize HTTP', init.status, '| session', sessionId);
check('server issued a real MCP session id', Boolean(sessionId), sessionId ?? 'none');

const before = await callTool('get_circuit_telemetry');
const evBefore = before.circuits.find((c) => c.id === 'ev_charger');
console.log('\nBASELINE  total', before.totalHomePowerKw, 'kW | ev_charger', evBefore.status, evBefore.powerKw, 'kW');

const staged = await callTool('stage_load_shift', { reason: 'orchestrator gate verification' });
console.log('\nSTAGED    ', staged.stagedActionId, staged.status);
check('staging reports PENDING_CONFIRMATION', staged.status === 'PENDING_CONFIRMATION', staged.status);
check('staging returns an action id', Boolean(staged.stagedActionId), staged.stagedActionId);

const during = await callTool('get_circuit_telemetry');
const evDuring = during.circuits.find((c) => c.id === 'ev_charger');
console.log('\nAFTER STAGING, BEFORE APPROVAL  total', during.totalHomePowerKw, 'kW | ev_charger', evDuring.status, evDuring.powerKw, 'kW');
check(
  'staging alone changes NO circuit state',
  during.totalHomePowerKw === before.totalHomePowerKw && evDuring.status === evBefore.status,
  `${before.totalHomePowerKw} -> ${during.totalHomePowerKw} kW, ev ${evBefore.status} -> ${evDuring.status}`
);

const confirmed = await callTool('confirm_load_shift', {
  stagedActionId: staged.stagedActionId,
  confirmed: true
});
console.log('\nCONFIRMED ', confirmed.status);
check('confirmation reports ACTION_EXECUTED', confirmed.status === 'ACTION_EXECUTED', confirmed.status);

const after = await callTool('get_circuit_telemetry');
const evAfter = after.circuits.find((c) => c.id === 'ev_charger');
console.log('\nAFTER APPROVAL  total', after.totalHomePowerKw, 'kW | ev_charger', evAfter.status, evAfter.powerKw, 'kW');
check(
  'approval actually mutates circuit state',
  after.totalHomePowerKw < before.totalHomePowerKw,
  `${before.totalHomePowerKw} -> ${after.totalHomePowerKw} kW`
);
check(
  'the reduction the plan promised is the reduction delivered',
  Math.abs(before.totalHomePowerKw - after.totalHomePowerKw - staged.projectedReductionKw) < 0.05,
  `promised ${staged.projectedReductionKw} kW, delivered ${(before.totalHomePowerKw - after.totalHomePowerKw).toFixed(2)} kW`
);

console.log('\n' + (fail.length ? 'GATE VERIFY FAILED: ' + fail.join('; ') : 'GATE VERIFY: all checks passed'));
process.exit(fail.length ? 1 : 0);
