import http from 'node:http';
import { createMcpApp, PROTOCOL_FLOOR } from '../src/server.js';

describe('MCP Server Live HTTP Integration Test', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = createMcpApp();
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number; address: string };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('performs live HTTP round-trip: handshake -> list tools -> invoke ping', async () => {
    // Step 1: Initialize handshake via real HTTP POST
    const initResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 101,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'integration-agent', version: '0.1.0' }
        }
      })
    });

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const initBody = await initResponse.json() as any;
    expect(initBody.jsonrpc).toBe('2.0');
    expect(initBody.id).toBe(101);
    expect(initBody.result).toBeDefined();
    expect(initBody.result.serverInfo.name).toBe('homeops-guardian');
    expect(initBody.result.capabilities.tools).toBeDefined();

    // Step 2: List tools via real HTTP POST with session ID
    const listResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Session-Id': sessionId!,
        'MCP-Protocol-Version': '2025-11-25'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 102,
        method: 'tools/list',
        params: {}
      })
    });

    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as any;
    expect(listBody.jsonrpc).toBe('2.0');
    expect(listBody.id).toBe(102);
    expect(Array.isArray(listBody.result.tools)).toBe(true);
    const pingTool = listBody.result.tools.find((t: any) => t.name === 'ping');
    expect(pingTool).toBeDefined();

    // Step 3: Invoke 'ping' tool via real HTTP POST
    const callResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Session-Id': sessionId!,
        'MCP-Protocol-Version': '2025-11-25'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 103,
        method: 'tools/call',
        params: {
          name: 'ping',
          arguments: {}
        }
      })
    });

    expect(callResponse.status).toBe(200);
    const callBody = await callResponse.json() as any;
    expect(callBody.jsonrpc).toBe('2.0');
    expect(callBody.id).toBe(103);
    expect(callBody.result.content).toBeDefined();

    const toolResult = JSON.parse(callBody.result.content[0].text);
    expect(toolResult.status).toBe('ok');
    expect(toolResult.timestamp).toBeDefined();
    expect(new Date(toolResult.timestamp).getTime()).toBeGreaterThan(0);

    // Step 4: Query circuit telemetry via real HTTP POST
    const telemetryResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Session-Id': sessionId!,
        'MCP-Protocol-Version': '2025-11-25'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 104,
        method: 'tools/call',
        params: {
          name: 'get_circuit_telemetry',
          arguments: {}
        }
      })
    });

    expect(telemetryResponse.status).toBe(200);
    const telemetryBody = (await telemetryResponse.json()) as any;
    const telemetry = JSON.parse(telemetryBody.result.content[0].text);
    expect(telemetry.utility).toBe('Pacific Gas & Electric (PG&E)');
    expect(telemetry.totalHomePowerKw).toBe(13.4);

    // Step 5: Stage load shift via real HTTP POST
    const stageResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Session-Id': sessionId!,
        'MCP-Protocol-Version': '2025-11-25'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 105,
        method: 'tools/call',
        params: {
          name: 'stage_load_shift',
          arguments: { reason: 'Integration test peak shaving' }
        }
      })
    });

    expect(stageResponse.status).toBe(200);
    const stageBody = (await stageResponse.json()) as any;
    const staged = JSON.parse(stageBody.result.content[0].text);
    expect(staged.status).toBe('PENDING_CONFIRMATION');
    expect(staged.confirmationRequired).toBe(true);
    expect(staged.stagedActionId).toBeDefined();

    // Step 6: Confirm load shift via real HTTP POST
    const confirmResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Session-Id': sessionId!,
        'MCP-Protocol-Version': '2025-11-25'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 106,
        method: 'tools/call',
        params: {
          name: 'confirm_load_shift',
          arguments: {
            stagedActionId: staged.stagedActionId,
            confirmed: true
          }
        }
      })
    });

    expect(confirmResponse.status).toBe(200);
    const confirmBody = (await confirmResponse.json()) as any;
    const confirmed = JSON.parse(confirmBody.result.content[0].text);
    expect(confirmed.status).toBe('ACTION_EXECUTED');
    expect(confirmed.newTotalHomePowerKw).toBe(3.8);
  });
});

/**
 * The Alexa+ track states a minimum MCP spec version of 2025-11-25. The SDK
 * will negotiate down to 2024-10-07 if a client asks for it, which would make
 * our own "implements 2025-11-25" claim true only of the best case. Measured
 * before the fix with ops/probe-protocol-version.mjs: a client asking for
 * 2024-11-05 was answered 200 / 2024-11-05.
 */
describe('MCP Server holds its declared protocol floor', () => {
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

  const initWith = async (protocolVersion: string) => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: 'floor-test', version: '0.1.0' }
        }
      })
    });
    return { status: res.status, body: (await res.json()) as any };
  };

  it('declares 2025-11-25 as the floor', () => {
    expect(PROTOCOL_FLOOR).toBe('2025-11-25');
  });

  it.each(['2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'])(
    'answers %s with the floor instead of negotiating down',
    async (asked) => {
      const { status, body } = await initWith(asked);
      expect(status).toBe(200);
      // Per the spec, a server that will not serve the requested version
      // responds with one it does support; the client then decides.
      expect(body.result.protocolVersion).toBe(PROTOCOL_FLOOR);
    }
  );

  it('serves the floor itself unchanged', async () => {
    const { status, body } = await initWith(PROTOCOL_FLOOR);
    expect(status).toBe(200);
    expect(body.result.protocolVersion).toBe(PROTOCOL_FLOOR);
  });
});
