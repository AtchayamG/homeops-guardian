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
    { body: {
      status: 'ACTION_EXECUTED', executedActions: [{ circuitId: 'ev_charger' }],
      deliveredReductionKw: 9.6, projectedReductionKw: 9.6
    } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp,
    'My EV charger is making the bill huge, can you do something tonight?',
    event => fixture.events.push(event));
  assert.deepEqual(fixture.calls, ['get_circuit_telemetry', 'stage_load_shift', 'confirm_load_shift']);
  assert.equal((fixture.events.find(e => e.type === 'final') as any).text,
    'Done. 1 circuit changed; delivered 9.6 kW of the 9.6 kW promised.');
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
    { body: {
      status: 'ACTION_CANCELLED', humanDecision: 'declined', executedActions: [], newTotalHomePowerKw: 13.4
    } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp, 'optimize', event => fixture.events.push(event));
  assert.deepEqual(fixture.calls, ['stage_load_shift', 'confirm_load_shift']);
  assert.match(fixture.sent[2].messages.at(-1).content[0].text, /Call confirm_load_shift/);
  assert.equal((fixture.events.find(e => e.type === 'final') as any).text,
    'You declined the plan, so nothing changed. The home is still drawing 13.4 kW.');
});

test('same-response stage and confirm is rejected, then a sequential confirm uses the returned id', async () => {
  const fixture = setup([
    response([
      use('stage_load_shift', 'stage-batch'),
      use('confirm_load_shift', 'confirm-batch', { stagedActionId: 'invented', confirmed: true })
    ]),
    response([use('confirm_load_shift', 'confirm-sequential', { stagedActionId: 'real-stage-id', confirmed: true })]),
    response([{ text: 'The shift was done.' }], 'end_turn')
  ], [
    { body: { stagedActionId: 'real-stage-id', status: 'PENDING_CONFIRMATION' } },
    { body: {
      status: 'ACTION_EXECUTED', executedActions: [{ circuitId: 'ev_charger' }],
      deliveredReductionKw: 9.6, projectedReductionKw: 9.6
    } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp, 'optimize', event => fixture.events.push(event));
  assert.deepEqual(fixture.calls, ['stage_load_shift', 'confirm_load_shift']);
  const firstReplan = fixture.sent[1].messages.at(-1).content;
  assert.match(fixture.sent[0].system[0].text, /Never call stage_load_shift and confirm_load_shift in the same response/);
  assert.equal(firstReplan[1].toolResult.status, 'error');
  assert.match(firstReplan[1].toolResult.content[0].json.error,
    /wait for the stage result and use its stagedActionId/);
  const sequentialCall = fixture.events.filter(event => event.type === 'tool_call' && event.name === 'confirm_load_shift').at(-1) as any;
  assert.equal(sequentialCall.args.stagedActionId, 'real-stage-id');
  assert.equal((fixture.events.find(event => event.type === 'final') as any).text,
    'Done. 1 circuit changed; delivered 9.6 kW of the 9.6 kW promised.');
});

test('human decline final is grounded in the confirmation result', async () => {
  const fixture = setup([
    response([use('stage_load_shift', 'stage')]),
    response([use('confirm_load_shift', 'confirm', { stagedActionId: 'real-stage-id', confirmed: true })]),
    response([{ text: 'The plan is cancelled.' }], 'end_turn')
  ], [
    { body: { stagedActionId: 'real-stage-id', status: 'PENDING_CONFIRMATION' } },
    { body: {
      status: 'ACTION_CANCELLED', humanDecision: 'declined', executedActions: [],
      newTotalHomePowerKw: 12.75
    } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp, 'optimize', event => fixture.events.push(event));
  assert.equal((fixture.events.find(event => event.type === 'final') as any).text,
    'You declined the plan, so nothing changed. The home is still drawing 12.75 kW.');
});

test('verified execution final quotes delivered and promised values from the result', async () => {
  const fixture = setup([
    response([use('stage_load_shift', 'stage')]),
    response([use('confirm_load_shift', 'confirm', { stagedActionId: 'real-stage-id', confirmed: true })]),
    response([{ text: 'The shift is complete.' }], 'end_turn')
  ], [
    { body: { stagedActionId: 'real-stage-id', status: 'PENDING_CONFIRMATION' } },
    { body: {
      status: 'ACTION_EXECUTED', executedActions: [{ circuitId: 'ev_charger' }, { circuitId: 'hvac_main' }],
      deliveredReductionKw: 8.7, projectedReductionKw: 9.1
    } }
  ]);
  await runAgentTurn(fixture.planner, fixture.mcp, 'optimize', event => fixture.events.push(event));
  assert.equal((fixture.events.find(event => event.type === 'final') as any).text,
    'Done. 2 circuits changed; delivered 8.7 kW of the 9.1 kW promised.');
});

test('confirmation timeout, cancellation, and missing capability explain that no change occurred', async () => {
  const cases = [
    [{ status: 'ACTION_CANCELLED', humanDecision: 'timeout' }, 'Approval timed out, so nothing changed.'],
    [{ status: 'ACTION_CANCELLED', humanDecision: 'cancelled' }, 'The confirmation was cancelled, so nothing changed.'],
    [{ code: 'HUMAN_CONFIRMATION_UNAVAILABLE' }, 'This client cannot ask a human for approval, so nothing was changed.']
  ] as const;
  for (const [confirmation, expected] of cases) {
    const fixture = setup([
      response([use('stage_load_shift', 'stage')]),
      response([use('confirm_load_shift', 'confirm', { stagedActionId: 'real-stage-id', confirmed: true })]),
      response([{ text: 'It may have changed.' }], 'end_turn')
    ], [
      { body: { stagedActionId: 'real-stage-id', status: 'PENDING_CONFIRMATION' } },
      { isError: 'code' in confirmation, body: confirmation }
    ]);
    await runAgentTurn(fixture.planner, fixture.mcp, 'optimize', event => fixture.events.push(event));
    assert.equal((fixture.events.find(event => event.type === 'final') as any).text, expected);
  }
});

test('a true negation about the charger is shown before confirmation', async () => {
  const fixture = setup([
    response([use('get_circuit_telemetry', 'telemetry')]),
    response([{ text: 'The charger was not paused.' }], 'end_turn')
  ], [{ body: { totalHomePowerKw: 13.4 } }]);
  await runAgentTurn(fixture.planner, fixture.mcp, 'status', event => fixture.events.push(event));
  assert.ok(fixture.events.some(event => event.type === 'model_text' && event.text === 'The charger was not paused.'));
  assert.equal((fixture.events.find(event => event.type === 'final') as any).text, 'The charger was not paused.');
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
