// One real agent turn. This test harness declines any elicitation; production
// approval happens only through the simulator UI. Prints no credentials.
import { randomUUID } from 'node:crypto';

const sessionId = randomUUID();
const response = await fetch('http://127.0.0.1:3003/agent/turn', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, utterance: 'My EV charger is making the bill huge, can you do something tonight?' })
});
if (!response.ok || !response.body) throw new Error(`Agent returned HTTP ${response.status}`);
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let bedrockRequests = 0;
let calls = 0;
while (true) {
  const { value, done } = await reader.read();
  buffer += decoder.decode(value, { stream: !done });
  let boundary;
  while ((boundary = buffer.indexOf('\n\n')) >= 0) {
    const packet = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    const data = packet.split('\n').find(line => line.startsWith('data: '));
    if (!data) continue;
    const event = JSON.parse(data.slice(6));
    if (event.type === 'planner') {
      if (event.requestId) { bedrockRequests++; console.log('BEDROCK', event.modelId, event.requestId); }
      else console.log('PLANNER', event.mode, event.modelId ?? '');
    } else if (event.type === 'model_text') {
      console.log('MODEL_TEXT', event.text);
    } else if (event.type === 'tool_call') {
      calls++;
      console.log('TOOL_CALL', event.name, JSON.stringify(event.args));
    } else if (event.type === 'tool_result') {
      console.log('TOOL_RESULT', event.name, event.isError ? 'error' : 'success', event.summary);
    } else if (event.type === 'mcp_frame') {
      const frame = event.frame ?? {};
      console.log('MCP_FRAME', event.direction, frame.method ?? (frame.error ? 'error' : 'response'));
    } else if (event.type === 'agent_unavailable') {
      console.log('AGENT_UNAVAILABLE', event.errorName);
    }
    if (event.type === 'human_confirmation_required') {
      console.log('HUMAN_CONFIRMATION_REQUIRED (probe declines)');
      const decision = await fetch('http://127.0.0.1:3003/agent/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elicitationId: event.elicitationId, approve: false })
      });
      if (!decision.ok) throw new Error(`Decline failed with HTTP ${decision.status}`);
    }
    if (event.type === 'final') console.log('FINAL', event.text);
  }
  if (done) break;
}
console.log('SUMMARY', JSON.stringify({ bedrockRequests, calls }));
if (!bedrockRequests) process.exitCode = 1;
