import http from 'node:http';
import { createMcpApp } from '../src/server.js';

/**
 * The confirmation gate's one promise is that what you approve is what runs.
 *
 * It used not to be checked, and it used not to be true by construction:
 * `stageAction` returned a hardcoded plan (7.2 kW, 2.4 kW, total 9.6 kW) while
 * `executeAction` separately hardcoded `ev.powerKw = 0` and
 * `hvac.powerKw = 1.4`. Both were typed against the same default household, so
 * they agreed, and `ops/verify-gate.mjs` printed "promised 9.6 kW, delivered
 * 9.60 kW" as proof. Two constants that happen to match are not a match.
 *
 * These tests measure the relationships instead of the values, so they keep
 * holding when the household changes and they fail if the plan and the
 * execution are ever wired to different sources again.
 */
describe('what the gate promises is what the execution delivers', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = createMcpApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  let sessionId: string;
  let nextId = 900;

  async function rpc(method: string, params: unknown) {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json'
    };
    if (sessionId) headers['MCP-Session-Id'] = sessionId;
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params })
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) sessionId = sid;
    return (await res.json()) as any;
  }

  async function callTool(name: string, args: Record<string, unknown> = {}) {
    const body = await rpc('tools/call', { name, arguments: args });
    return JSON.parse(body.result.content[0].text);
  }

  beforeAll(async () => {
    await rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'gate-invariants', version: '1.0' }
    });
  });

  it('the staged total is the sum of the staged items, not a separate figure', async () => {
    const staged = await callTool('stage_load_shift', {});
    const sum = staged.proposedActions.reduce(
      (acc: number, a: any) => acc + a.powerReductionKw,
      0
    );
    expect(staged.projectedReductionKw).toBeCloseTo(sum, 2);
    expect(staged.proposedActions.length).toBeGreaterThan(0);
  });

  it('the money figure carries the arithmetic that produced it', async () => {
    const staged = await callTool('stage_load_shift', {});
    expect(typeof staged.savingsBasis).toBe('string');
    expect(staged.savingsBasis).toMatch(/peak hours/);
    // 5 peak hours x 21.7 weekdays x $0.14 differential = $15.19 per kW shifted.
    const perKw = 5 * 21.7 * (0.48 - 0.34);
    expect(staged.estimatedMonthlySavingsUsd).toBeCloseTo(
      Number((staged.projectedReductionKw * perKw).toFixed(2)),
      1
    );
  });

  it('nothing moves on staging alone', async () => {
    const before = await callTool('get_circuit_telemetry', {});
    await callTool('stage_load_shift', {});
    const after = await callTool('get_circuit_telemetry', {});
    expect(after.totalHomePowerKw).toBeCloseTo(before.totalHomePowerKw, 2);
  });

  it('execution itemises exactly the circuits the plan named, and delivers what it promised', async () => {
    const before = await callTool('get_circuit_telemetry', {});
    const staged = await callTool('stage_load_shift', {});

    const result = await callTool('confirm_load_shift', {
      stagedActionId: staged.stagedActionId,
      confirmed: true
    });

    expect(result.status).toBe('ACTION_EXECUTED');

    // Same circuits, same order-independent set.
    expect(result.executedActions.map((a: any) => a.circuitId).sort()).toEqual(
      staged.proposedActions.map((a: any) => a.circuitId).sort()
    );

    // Promised equals delivered, both derived rather than asserted.
    expect(result.deliveredReductionKw).toBeCloseTo(staged.projectedReductionKw, 2);

    // And the delivered reduction is visible in the household total, so the
    // figure cannot be right while the state is wrong.
    const after = await callTool('get_circuit_telemetry', {});
    expect(before.totalHomePowerKw - after.totalHomePowerKw).toBeCloseTo(
      result.deliveredReductionKw,
      2
    );

    // Each item's own before/after agrees with its claimed reduction.
    for (const a of result.executedActions) {
      expect(a.beforeKw - a.afterKw).toBeCloseTo(a.powerReductionKw, 2);
    }
  });

  it('a second plan, staged against the changed household, proposes less - which a hardcoded plan could not do', async () => {
    // This is the test that would have caught the original defect. After the
    // shift has run, ev_charger is already at 0 kW, so a plan derived from
    // current state must propose a smaller reduction than the first one. A
    // plan with the numbers typed in would propose the same 9.6 kW again.
    const restaged = await callTool('stage_load_shift', {});
    expect(restaged.projectedReductionKw).toBeLessThan(9.6);

    const ev = restaged.proposedActions.find((a: any) => a.circuitId === 'ev_charger');
    expect(ev).toBeDefined();
    expect(ev.powerReductionKw).toBe(0);
  });

  it('cancelling reports no executed actions and moves nothing', async () => {
    const before = await callTool('get_circuit_telemetry', {});
    const staged = await callTool('stage_load_shift', {});
    const result = await callTool('confirm_load_shift', {
      stagedActionId: staged.stagedActionId,
      confirmed: false
    });

    expect(result.status).toBe('ACTION_CANCELLED');
    expect(result.executedActions).toEqual([]);
    expect(result.deliveredReductionKw).toBe(0);

    const after = await callTool('get_circuit_telemetry', {});
    expect(after.totalHomePowerKw).toBeCloseTo(before.totalHomePowerKw, 2);
  });
});
