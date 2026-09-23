import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BedrockPlanner, MAX_STEPS, runAgentTurn, type AgentEvent, type ToolCaller } from '../src/planner.js';

const tools = [
  { name: 'get_circuit_telemetry', inputSchema: { type: 'object', properties: {} } },
  { name: 'stage_load_shift', inputSchema: { type: 'object', properties: {} } },
  { name: 'confirm_load_shift', inputSchema: { type: 'object', properties: {} } }
];
const use = (name: string, id: string, input = {}) => ({ toolUse: { name, toolUseId: id, input } });
const response = (content: unknown[], stopReason = 'tool_use') => ({
  output: { message: { role: 'assistant', content } }, stopReason, $metadata: { requestId: 'test-request' }
});

function setup(replies: unknown[], results: Array<{ isError?: boolean; body: unknown }>) {
  const sent: any[] = [];
  const runtime = { send: async (command: any) => {
    sent.push(structuredClone(command.input));
    return replies.shift();
  } };
  const calls: string[] = [];
  const mcp: ToolCaller = {
    listTools: async () => ({ tools }),
    callTool: async ({ name }) => {
      calls.push(name);
      const result = results.shift() ?? { isError: true, body: { error: 'missing stub result' } };
      return { isError: result.isError, content: [{ type: 'text', text: JSON.stringify(result.body) }] };
    }
  };
  const events: AgentEvent[] = [];
  return { planner: new BedrockPlanner(runtime as any), mcp, events, sent, calls };
}

test('off-script sentence leads through telemetry, staging, human gate, and verified execution', async () => {
  const fixture = setup([
    response([use('get_circuit_telemetry', 't1')]),
    response([use('stage_load_shift', 't2')]),
    response([use('confirm_load_shift', 't3', { stagedActionId: 'staged', confirmed: true })]),
    response([{ text: 'The simulated load shift was completed.' }], 'end_turn')
  ], [
    { body: { dataSource: { kind: 'simulated-household' }, totalHomePowerKw: 13.4 } },
    { body: { stagedActionId: 'staged', status: 'PENDING_CONFIRMATION' } },
    { body: { status: 'ACTION_EXECUTED', executedActions: [{ circuitId: 'ev_charger' }], deliveredReductionKw: 9.6 } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp,
    'My EV charger is making the bill huge, can you do something tonight?',
    event => fixture.events.push(event));
  assert.deepEqual(fixture.calls, ['get_circuit_telemetry', 'stage_load_shift', 'confirm_load_shift']);
  assert.equal((fixture.events.find(e => e.type === 'final') as any).text, 'The simulated load shift was completed.');
  assert.deepEqual(fixture.sent[0].toolConfig.tools.map((t: any) => t.toolSpec.name), tools.map(t => t.name));
});

test('tool isError returns to Bedrock as status error and the next step replans', async () => {
  const fixture = setup([
    response([use('get_circuit_telemetry', 'bad')]),
    response([use('get_circuit_telemetry', 'retry')]),
    response([{ text: 'I read the simulated telemetry.' }], 'end_turn')
  ], [
    { isError: true, body: { code: 'TEMPORARY' } },
    { body: { totalHomePowerKw: 13.4 } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp, 'status', event => fixture.events.push(event));
  assert.equal(fixture.sent[1].messages.at(-1).content[0].toolResult.status, 'error');
  assert.deepEqual(fixture.calls, ['get_circuit_telemetry', 'get_circuit_telemetry']);
});

test('a model that asks for text confirmation after staging is steered to the MCP gate', async () => {
  const fixture = setup([
    response([use('stage_load_shift', 'stage')]),
    response([{ text: 'Please type CONFIRM.' }], 'end_turn'),
    response([use('confirm_load_shift', 'confirm', { stagedActionId: 'staged', confirmed: true })]),
    response([{ text: 'The user declined.' }], 'end_turn')
  ], [
    { body: { stagedActionId: 'staged', status: 'PENDING_CONFIRMATION' } },
    { body: { status: 'ACTION_CANCELLED', humanDecision: 'declined', executedActions: [] } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp, 'optimize', event => fixture.events.push(event));
  assert.deepEqual(fixture.calls, ['stage_load_shift', 'confirm_load_shift']);
  assert.match(fixture.sent[2].messages.at(-1).content[0].text, /Call confirm_load_shift/);
  assert.equal((fixture.events.find(e => e.type === 'final') as any).text,
    'No load shift was verified as executed.');
});

test('caps model steps and blocks an unverified done claim', async () => {
  const endless = setup(Array.from({ length: MAX_STEPS }, (_, i) =>
    response([use('get_circuit_telemetry', `t${i}`)])), []);
  await runAgentTurn(endless.planner, endless.mcp, 'status', event => endless.events.push(event));
  assert.equal(endless.sent.length, MAX_STEPS);
  assert.ok(endless.events.some(e => e.type === 'agent_unavailable' && e.errorName === 'MAX_STEPS_REACHED'));

  const falseDone = setup([response([{ text: 'I executed the load shift.' }], 'end_turn')], []);
  await runAgentTurn(falseDone.planner, falseDone.mcp, 'optimize', event => falseDone.events.push(event));
  assert.equal((falseDone.events.find(e => e.type === 'final') as any).text, 'No load shift was verified as executed.');
});
