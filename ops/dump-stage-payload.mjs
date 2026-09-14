/**
 * Prints the exact JSON that stage_load_shift returns, so a UI can be written
 * against the payload the server really sends rather than against a guess.
 *
 * This exists because the simulator's confirmation gate was found rendering a
 * hardcoded plan - two named circuits and their kW, typed into the HTML -
 * instead of the staged plan in this payload. Anything the gate displays has
 * to come from here.
 */
const ENDPOINT = process.env.MCP_URL || 'http://127.0.0.1:3001/mcp';

const HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream'
};

function parseBody(text) {
  // Streamable HTTP may answer as SSE; take the last data: line if so.
  if (text.startsWith('event:') || text.includes('\ndata: ')) {
    const lines = text.split('\n').filter((l) => l.startsWith('data: '));
    return JSON.parse(lines[lines.length - 1].slice(6));
  }
  return JSON.parse(text);
}

async function rpc(body, sessionId) {
  const headers = { ...HEADERS };
  if (sessionId) headers['MCP-Session-Id'] = sessionId;
  const res = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { res, json: text ? parseBody(text) : null };
}

const init = await rpc({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'dump-stage-payload', version: '1.0' }
  }
});
const sessionId = init.res.headers.get('mcp-session-id');
console.log('session', sessionId, '| negotiated', init.json?.result?.protocolVersion);

await rpc({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, sessionId);

const staged = await rpc(
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'stage_load_shift', arguments: {} }
  },
  sessionId
);

const content = staged.json?.result?.content ?? [];
for (const part of content) {
  if (part.type === 'text') {
    console.log('\n--- stage_load_shift text content ---');
    try {
      console.log(JSON.stringify(JSON.parse(part.text), null, 2));
    } catch {
      console.log(part.text);
    }
  } else {
    console.log('\n--- non-text content part ---');
    console.log(JSON.stringify(part, null, 2));
  }
}

await fetch(ENDPOINT, { method: 'DELETE', headers: { ...HEADERS, 'MCP-Session-Id': sessionId } });
console.log('\nsession closed');
