// Live MCP gate probe. The scripted answers below represent test-harness human
// choices; the production agent forwards elicitation to the actual UI instead.
import { Client } from '../services/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../services/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { ElicitRequestSchema } from '../services/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';

const endpoint = new URL('http://127.0.0.1:3001/mcp');
const failures = [];
function check(label, actual, expected) {
  const pass = actual === expected;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}: ${actual}`);
  if (!pass) failures.push(`${label}: expected ${expected}, got ${actual}`);
}
async function connect(decide) {
  const client = new Client({ name: 'gate-verification', version: '1.0.0' });
  if (decide) {
    client.registerCapabilities({ elicitation: { form: {} } });
    client.setRequestHandler(ElicitRequestSchema, async request => {
      check('elicitation cites staged EV circuit', request.params.message.includes('ev_charger'), true);
      check('elicitation cites promised reduction', request.params.message.includes('9.6 kW'), true);
      return decide() ? { action: 'accept', content: { approve: true } } : { action: 'decline' };
    });
  }
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  return client;
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const body = JSON.parse(result.content.find(part => part.type === 'text').text);
  return { ...body, isError: Boolean(result.isError) };
}

try {
  const client = await connect(() => false);
  const before = await call(client, 'get_circuit_telemetry');
  check('baseline draw kW', before.totalHomePowerKw, 13.4);
  check('baseline EV status', before.circuits.find(c => c.id === 'ev_charger').status, 'CHARGING');
  const staged = await call(client, 'stage_load_shift');
  check('staged status', staged.status, 'PENDING_CONFIRMATION');
  const during = await call(client, 'get_circuit_telemetry');
  check('draw before approval kW', during.totalHomePowerKw, 13.4);
  const denied = await call(client, 'confirm_load_shift', { stagedActionId: staged.stagedActionId, confirmed: true });
  check('human decline status', denied.status, 'ACTION_CANCELLED');
  const afterDecline = await call(client, 'get_circuit_telemetry');
  check('draw after decline kW', afterDecline.totalHomePowerKw, 13.4);
  await client.close();

  const noCapability = await connect();
  const noCapabilityPlan = await call(noCapability, 'stage_load_shift');
  const blocked = await call(noCapability, 'confirm_load_shift', {
    stagedActionId: noCapabilityPlan.stagedActionId, confirmed: true
  });
  check('no capability error', blocked.code, 'HUMAN_CONFIRMATION_UNAVAILABLE');
  check('no capability isError', blocked.isError, true);
  check('draw without capability kW', (await call(noCapability, 'get_circuit_telemetry')).totalHomePowerKw, 13.4);
  await noCapability.close();

  const approvedClient = await connect(() => true);
  const approvedPlan = await call(approvedClient, 'stage_load_shift');
  const approved = await call(approvedClient, 'confirm_load_shift', {
    stagedActionId: approvedPlan.stagedActionId, confirmed: true
  });
  check('human approval status', approved.status, 'ACTION_EXECUTED');
  check('executed actions present', approved.executedActions.length > 0, true);
  check('promised reduction kW', approved.projectedReductionKw, 9.6);
  check('delivered reduction kW', approved.deliveredReductionKw, 9.6);
  const after = await call(approvedClient, 'get_circuit_telemetry');
  check('draw after approval kW', after.totalHomePowerKw, 3.8);
  check('EV after approval', after.circuits.find(c => c.id === 'ev_charger').status, 'PAUSED');
  await approvedClient.close();

  console.log(failures.length ? `GATE VERIFY FAILED: ${failures.join('; ')}` : 'GATE VERIFY: all checks passed');
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error('GATE VERIFY BLOCKED:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
