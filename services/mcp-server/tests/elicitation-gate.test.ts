import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createMcpApp } from '../src/server.js';

describe('human approval is an MCP elicitation, not a tool argument', () => {
  let server: http.Server;
  let baseUrl: string;
  const clients: Client[] = [];

  beforeAll(async () => {
    server = http.createServer(createMcpApp().app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    await Promise.all(clients.map(client => client.close()));
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  async function connect(answer?: () => boolean) {
    const client = new Client({ name: 'gate-test-client', version: '1.0.0' });
    if (answer) {
      client.registerCapabilities({ elicitation: { form: {} } });
      client.setRequestHandler(ElicitRequestSchema, async () =>
        answer()
          ? { action: 'accept', content: { approve: true } }
          : { action: 'decline' }
      );
    }
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    clients.push(client);
    return client;
  }

  async function call(client: Client, name: string, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.find(part => part.type === 'text');
    return { isError: result.isError, body: text?.type === 'text' ? JSON.parse(text.text) : {} };
  }

  it('fails closed without client elicitation capability', async () => {
    const client = await connect();
    const staged = await call(client, 'stage_load_shift');
    const result = await call(client, 'confirm_load_shift', {
      stagedActionId: staged.body.stagedActionId, confirmed: true
    });
    expect(result.isError).toBe(true);
    expect(result.body.code).toBe('HUMAN_CONFIRMATION_UNAVAILABLE');
    const telemetry = await call(client, 'get_circuit_telemetry');
    expect(telemetry.body.totalHomePowerKw).toBe(13.4);
    expect(telemetry.body.circuits.find((c: any) => c.id === 'ev_charger').status).toBe('CHARGING');
  });

  it('repeated model calls cannot overrule a human decline', async () => {
    let requests = 0;
    const client = await connect(() => { requests++; return false; });
    const staged = await call(client, 'stage_load_shift');
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await call(client, 'confirm_load_shift', {
        stagedActionId: staged.body.stagedActionId, confirmed: true
      });
      expect(result.body.status).not.toBe('ACTION_EXECUTED');
    }
    expect(requests).toBeGreaterThan(0);
    const telemetry = await call(client, 'get_circuit_telemetry');
    expect(telemetry.body.totalHomePowerKw).toBe(13.4);
  });

  it('confirmed:false cancels immediately without elicitation capability', async () => {
    const client = await connect();
    const staged = await call(client, 'stage_load_shift');
    const result = await call(client, 'confirm_load_shift', {
      stagedActionId: staged.body.stagedActionId, confirmed: false
    });
    expect(result.body.status).toBe('ACTION_CANCELLED');
    expect((await call(client, 'get_circuit_telemetry')).body.totalHomePowerKw).toBe(13.4);
  });

  it('an accept action without approve:true cannot execute', async () => {
    const client = new Client({ name: 'negative-approval', version: '1.0.0' });
    client.registerCapabilities({ elicitation: { form: {} } });
    client.setRequestHandler(ElicitRequestSchema, async () => ({
      action: 'accept', content: { approve: false }
    }));
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    clients.push(client);
    const staged = await call(client, 'stage_load_shift');
    const result = await call(client, 'confirm_load_shift', {
      stagedActionId: staged.body.stagedActionId, confirmed: true
    });
    expect(result.body.status).toBe('ACTION_CANCELLED');
    expect((await call(client, 'get_circuit_telemetry')).body.totalHomePowerKw).toBe(13.4);
  });

  it.each([
    ['cancel', async () => ({ action: 'cancel' as const }), 'cancelled'],
    ['timeout', async () => { throw new Error('elicitation timed out'); }, 'timeout']
  ])('%s leaves circuits unchanged and says why', async (_label, handler, expected) => {
    const client = new Client({ name: 'no-approval', version: '1.0.0' });
    client.registerCapabilities({ elicitation: { form: {} } });
    client.setRequestHandler(ElicitRequestSchema, handler);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    clients.push(client);
    const staged = await call(client, 'stage_load_shift');
    const result = await call(client, 'confirm_load_shift', {
      stagedActionId: staged.body.stagedActionId, confirmed: true
    });
    expect(result.body.status).toBe('ACTION_CANCELLED');
    expect(result.body.humanDecision).toBe(expected);
    expect((await call(client, 'get_circuit_telemetry')).body.totalHomePowerKw).toBe(13.4);
  });

  it('another MCP session cannot confirm a staged plan even with elicitation', async () => {
    const owner = await connect(() => true);
    const other = await connect(() => true);
    const staged = await call(owner, 'stage_load_shift');
    const result = await call(other, 'confirm_load_shift', {
      stagedActionId: staged.body.stagedActionId, confirmed: true
    });
    expect(result.isError).toBe(true);
    expect((await call(owner, 'get_circuit_telemetry')).body.totalHomePowerKw).toBe(13.4);
  });

  it('a human acceptance executes the staged plan exactly', async () => {
    let message = '';
    const client = new Client({ name: 'gate-accept-client', version: '1.0.0' });
    client.registerCapabilities({ elicitation: { form: {} } });
    client.setRequestHandler(ElicitRequestSchema, async request => {
      message = request.params.message;
      return { action: 'accept', content: { approve: true } };
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    clients.push(client);
    const staged = await call(client, 'stage_load_shift');
    const result = await call(client, 'confirm_load_shift', {
      stagedActionId: staged.body.stagedActionId, confirmed: true
    });
    expect(message).toContain('ev_charger');
    expect(message).toContain('9.6');
    expect(message).toContain(staged.body.savingsBasis);
    expect(result.body.status).toBe('ACTION_EXECUTED');
    expect(result.body.executedActions.length).toBeGreaterThan(0);
    expect(result.body.projectedReductionKw).toBe(9.6);
    expect(result.body.deliveredReductionKw).toBe(9.6);
    const telemetry = await call(client, 'get_circuit_telemetry');
    expect(telemetry.body.totalHomePowerKw).toBe(3.8);
    expect(telemetry.body.circuits.find((c: any) => c.id === 'ev_charger').status).toBe('PAUSED');
  });
});
