/**
 * Evidence for friction-log entry P3-F2.
 *
 * The hackathon resources page states a MINIMUM MCP spec version of
 * 2025-11-25. @modelcontextprotocol/sdk 1.30.0 ships:
 *
 *   LATEST_PROTOCOL_VERSION            = '2025-11-25'
 *   DEFAULT_NEGOTIATED_PROTOCOL_VERSION = '2025-03-26'
 *
 * So the question a builder needs answered, and which no page answers, is:
 * what does my server actually negotiate when a client asks for something
 * older, or asks for nothing at all? This probes it against the running
 * server and prints what came back.
 *
 * Usage: node ops/probe-protocol-version.mjs   (server must be on :3001)
 */
const URL_MCP = process.env.MCP_URL || 'http://127.0.0.1:3001/mcp';

const post = async (body, extraHeaders = {}) => {
  const res = await fetch(URL_MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, sessionId: res.headers.get('mcp-session-id'), json };
};

const init = (protocolVersion) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    ...(protocolVersion === undefined ? {} : { protocolVersion }),
    capabilities: {},
    clientInfo: { name: 'protocol-version-probe', version: '0.0.1' }
  }
});

const cases = [
  ['client asks for 2025-11-25 (the hackathon minimum)', '2025-11-25'],
  ['client asks for 2025-06-18', '2025-06-18'],
  ['client asks for 2025-03-26 (the SDK default)', '2025-03-26'],
  ['client asks for 2024-11-05', '2024-11-05'],
  ['client omits protocolVersion entirely', undefined],
  ['client asks for a version that does not exist', '2099-01-01']
];

console.log(`Probing ${URL_MCP}\n`);
console.log('request'.padEnd(52), 'HTTP', 'negotiated');
console.log('-'.repeat(52), '----', '-'.repeat(12));

for (const [label, version] of cases) {
  const { status, json } = await post(init(version));
  const negotiated =
    json?.result?.protocolVersion ??
    (json?.error ? `error ${json.error.code}: ${String(json.error.message).slice(0, 60)}` : '(none)');
  console.log(label.padEnd(52), String(status).padEnd(4), negotiated);
}

console.log(
  '\nRead this against the resources page requirement of a 2025-11-25 minimum:\n' +
    'whatever appears in the "negotiated" column is what a judge would actually\n' +
    'be talking to, not what the README claims.'
);
