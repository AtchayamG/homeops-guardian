import request from 'supertest';
import { createMcpApp } from '../src/server.js';

describe('MCP Server Unit Tests', () => {
  let app: any;
  let sessionId: string;

  beforeAll(() => {
    const instance = createMcpApp();
    app = instance.app;
  });

  it('health endpoint returns 200 and ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('homeops-guardian-mcp');
  });

  it('handles OPTIONS preflight for browser clients with CORS and exposed headers', async () => {
    const res = await request(app)
      .options('/mcp')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Accept, MCP-Session-Id, MCP-Protocol-Version');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-expose-headers']).toContain('MCP-Session-Id');
  });

  it('rejects POST /mcp without both required Accept headers with 406', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(406);
    expect(res.body.error.message).toContain('Accept');
  });

  it('performs initialize handshake over POST /mcp and receives MCP-Session-Id', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

    expect(res.status).toBe(200);
    expect(res.headers['mcp-session-id']).toBeDefined();
    sessionId = res.headers['mcp-session-id'];
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);

    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.id).toBe(1);
    expect(res.body.result).toBeDefined();
    expect(res.body.result.serverInfo.name).toBe('homeops-guardian');
    expect(res.body.result.capabilities.tools).toBeDefined();
  });

  it('lists all registered tools via tools/list', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .set('MCP-Protocol-Version', '2025-11-25')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      });

    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.id).toBe(2);
    expect(res.body.result.tools).toBeDefined();

    const toolNames = res.body.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('ping');
    expect(toolNames).toContain('get_circuit_telemetry');
    expect(toolNames).toContain('stage_load_shift');
    expect(toolNames).toContain('confirm_load_shift');
  });

  it('executes tools/call for ping', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .set('MCP-Protocol-Version', '2025-11-25')
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'ping',
          arguments: {}
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.result.content[0].type).toBe('text');
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.status).toBe('ok');
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
  });

  // Renamed. It used to say "with real PG&E tariff", which is the claim the
  // payload should never make: the figures are a modelled fixture, not a rate
  // quote. A test title is a claim too, and this one was wrong.
  it('executes tools/call for get_circuit_telemetry with modelled tariff and circuit loads', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .set('MCP-Protocol-Version', '2025-11-25')
      .send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'get_circuit_telemetry',
          arguments: {}
        }
      });

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.utility).toBe('Pacific Gas & Electric (PG&E)');
    expect(parsed.currentTariff.tier).toBe('PEAK');
    expect(parsed.currentTariff.ratePerKwh).toBe(0.48);
    expect(parsed.circuits.length).toBe(3);
    expect(parsed.totalHomePowerKw).toBe(13.4);

    // The payload names a real utility and a real tariff schedule next to a
    // live timestamp. That reads as a rate quote fetched seconds ago, and it is
    // a fixture. Provenance must ship WITH the data or the data is misleading,
    // so this asserts the disclosure cannot be quietly dropped by a later edit.
    expect(parsed.dataSource).toBeDefined();
    expect(parsed.dataSource.kind).toBe('simulated-household');
    expect(parsed.dataSource.liveRateFeed).toBe(false);
    expect(parsed.dataSource.liveMeter).toBe(false);
    expect(parsed.dataSource.tariffBasis).toMatch(/model/i);
    expect(parsed.dataSource.tariffReference).toMatch(/^https:\/\//);
  });

  it('does not describe simulated telemetry as real-time in its tool schema', async () => {
    // The tool DESCRIPTION is what an LLM client reads to decide how much
    // authority to give the answer, so it is the first place the honesty has to
    // live. It used to begin "Query real-time electrical circuit power
    // telemetry", over three hard-coded circuits.
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .set('MCP-Protocol-Version', '2025-11-25')
      .send({ jsonrpc: '2.0', id: 41, method: 'tools/list', params: {} });

    expect(res.status).toBe(200);
    const tool = res.body.result.tools.find((t: any) => t.name === 'get_circuit_telemetry');
    expect(tool).toBeDefined();
    expect(tool.description).not.toMatch(/real-time/i);
    expect(tool.description).toMatch(/simulated/i);
  });

  let stagedActionId: string;

  it('executes tools/call for stage_load_shift and requires human confirmation', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .set('MCP-Protocol-Version', '2025-11-25')
      .send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'stage_load_shift',
          arguments: {
            reason: 'Reduce peak electric spend'
          }
        }
      });

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.status).toBe('PENDING_CONFIRMATION');
    expect(parsed.confirmationRequired).toBe(true);
    expect(parsed.stagedActionId).toBeDefined();
    expect(parsed.projectedReductionKw).toBe(9.6);
    stagedActionId = parsed.stagedActionId;
  });

  it('executes tools/call for confirm_load_shift with confirmed=true and updates power draw', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .set('MCP-Protocol-Version', '2025-11-25')
      .send({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'confirm_load_shift',
          arguments: {
            stagedActionId,
            confirmed: true
          }
        }
      });

    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body.result.content[0].text);
    expect(parsed.status).toBe('ACTION_EXECUTED');
    expect(parsed.newTotalHomePowerKw).toBe(3.8);

    // Verify circuit telemetry reflects updated load
    const telemetryRes = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .set('MCP-Protocol-Version', '2025-11-25')
      .send({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'get_circuit_telemetry',
          arguments: {}
        }
      });

    const updatedTelemetry = JSON.parse(telemetryRes.body.result.content[0].text);
    expect(updatedTelemetry.totalHomePowerKw).toBe(3.8);
    const ev = updatedTelemetry.circuits.find((c: any) => c.id === 'ev_charger');
    expect(ev.status).toBe('PAUSED');
    expect(ev.powerKw).toBe(0.0);
  });

  it('rejects non-initialization requests missing MCP-Session-Id with 400', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/list',
        params: {}
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Missing MCP-Session-Id');
  });

  it('rejects a GET that does not accept text/event-stream with 406', async () => {
    // The SSE stream is the one thing GET /mcp exists to serve, so a client
    // that cannot read it must be told so rather than handed an empty 200.
    const res = await request(app)
      .get('/mcp')
      .set('Accept', 'application/json');

    expect(res.status).toBe(406);
    expect(res.body.error.message).toContain('text/event-stream');
  });

  it('rejects invalid or unknown MCP-Session-Id with 404', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', 'unknown-session-1234')
      .send({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/list',
        params: {}
      });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Session not found');
  });

  it('rejects disallowed Origin header with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Origin', 'http://malicious-site.com')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 10,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'attacker', version: '1.0' }
        }
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Forbidden');
  });

  it('terminates session via DELETE /mcp', async () => {
    const res = await request(app)
      .delete('/mcp')
      .set('MCP-Session-Id', sessionId);

    expect(res.status).toBe(204);

    // Verify session is gone
    const checkRes = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('MCP-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/list',
        params: {}
      });

    expect(checkRes.status).toBe(404);
  });
});
