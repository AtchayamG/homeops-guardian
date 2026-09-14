/**
 * Records the app segments of the demo, one screencast clip per segment, each
 * paced to the measured length of its own voiceover.
 *
 *   node ops/video/generate-tts.mjs   (or ops\video\tts.cmd)
 *   ops\run-both-detached.cmd
 *   node ops/video/record.mjs
 *
 * Writes ops/video/frames/<segment>/frame_*.jpg plus
 * ops/video/frames/<segment>/concat.txt for ffmpeg, and a manifest.
 *
 * Two things this deliberately does NOT do.
 *
 * It does not start the server itself. The recorder that shipped with Project 2
 * launched `node dist/index.js`, which is how a demo ends up recording a stale
 * build - the exact bug that had this project's protocol floor reporting the
 * pre-fix behaviour while its tests were green. Here the recorder refuses to
 * run unless a server is already up, and prints what to run.
 *
 * And it does not fake a turn. Every utterance below is a click on one of the
 * app's own suggested-prompt chips, and every number that reaches the screen
 * came from a tool result over MCP during this take.
 */
import puppeteer from '../../apps/simulator/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FRAMES = join(here, 'frames');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SIM = 'http://127.0.0.1:5173/';
const MCP_HEALTH = 'http://127.0.0.1:3001/health';

const vo = JSON.parse(readFileSync(join(here, 'vo-manifest.json'), 'utf8'));
const voDur = (id) => {
  const seg = vo.segments.find((s) => s.id === id);
  if (!seg) throw new Error(`no voiceover measured for ${id}`);
  return seg.durationSec;
};

// Screen time per segment: its narration plus a breath at the end, so the cut
// never clips a word and never sits silent for long.
const PAD = 1.4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function assertServerUp() {
  try {
    const res = await fetch(MCP_HEALTH);
    if (!res.ok) throw new Error(`health returned ${res.status}`);
    const body = await res.json();
    console.log(`[record] server up: ${body.service} (${body.activeSessions} sessions)`);
  } catch (err) {
    console.error('\n[record] No MCP server on 127.0.0.1:3001.');
    console.error('[record] Start both halves first, from source:\n');
    console.error('    ops\\run-both-detached.cmd\n');
    console.error(`[record] (${err instanceof Error ? err.message : String(err)})`);
    process.exit(2);
  }
}

/**
 * The household lives in the server process, so a take recorded after a
 * verification run opens with the load already shifted: the charger paused and
 * every proposed reduction 0 kW. That is the app telling the truth - the plan
 * is derived from current state - but it is not the take, and a recorder that
 * filmed it anyway would produce a demo whose narration and screen disagree.
 * So check, and say what to do.
 */
async function assertFreshHousehold() {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  };
  const init = await fetch('http://127.0.0.1:3001/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'record-preflight', version: '1.0' }
      }
    })
  });
  const sid = init.headers.get('mcp-session-id');
  const withSession = { ...headers, 'MCP-Session-Id': sid };

  await fetch('http://127.0.0.1:3001/mcp', {
    method: 'POST',
    headers: withSession,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  });

  const res = await fetch('http://127.0.0.1:3001/mcp', {
    method: 'POST',
    headers: withSession,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_circuit_telemetry', arguments: {} }
    })
  });
  const body = await res.json();
  const payload = JSON.parse(body.result.content[0].text);
  const ev = payload.circuits.find((c) => c.id === 'ev_charger');

  await fetch('http://127.0.0.1:3001/mcp', { method: 'DELETE', headers: withSession });

  if (!ev || ev.status !== 'CHARGING') {
    console.error(
      `\n[record] The household is already shifted (ev_charger is ${ev ? ev.status : 'missing'}, total ${payload.totalHomePowerKw} kW).`
    );
    console.error('[record] State lives in the server process. Restart both halves for a clean take:\n');
    console.error('    ops\\run-both-detached.cmd\n');
    process.exit(3);
  }
  console.log(
    `[record] household fresh: total ${payload.totalHomePowerKw} kW, ev_charger ${ev.status} ${ev.powerKw} kW`
  );
}

await assertServerUp();
await assertFreshHousehold();

if (existsSync(FRAMES)) rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--no-sandbox',
    '--window-size=1920,1080',
    '--force-device-scale-factor=1',
    '--hide-scrollbars'
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [page error]', m.text());
});

const client = await page.target().createCDPSession();
const manifest = [];

let current = null;
let frameIndex = 0;

client.on('Page.screencastFrame', async ({ data, sessionId }) => {
  if (current) {
    const tMs = Date.now() - current.startedAt;
    const file = `frame_${String(frameIndex++).padStart(6, '0')}.jpg`;
    writeFileSync(join(current.dir, file), Buffer.from(data, 'base64'));
    current.frames.push({ file, tMs });
  }
  try {
    await client.send('Page.screencastFrameAck', { sessionId });
  } catch {
    // the session may be closing
  }
});

async function startClip(id) {
  const dir = join(FRAMES, id);
  mkdirSync(dir, { recursive: true });
  frameIndex = 0;
  current = { id, dir, frames: [], startedAt: Date.now(), target: voDur(id) + PAD };
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  console.log(`[clip ${id}] target ${current.target.toFixed(2)}s`);
}

async function holdUntilTarget() {
  const elapsed = (Date.now() - current.startedAt) / 1000;
  const remaining = current.target - elapsed;
  if (remaining > 0) await sleep(remaining * 1000);
  else console.log(`  [clip ${current.id}] actions ran ${(-remaining).toFixed(2)}s past target`);
}

async function endClip() {
  await holdUntilTarget();
  await client.send('Page.stopScreencast');
  const dur = (Date.now() - current.startedAt) / 1000;

  // ffmpeg concat needs each frame's own on-screen duration, which is the gap
  // to the next frame. The last frame holds until the clip ends.
  const lines = [];
  for (let i = 0; i < current.frames.length; i++) {
    const f = current.frames[i];
    const next = current.frames[i + 1];
    const holdMs = (next ? next.tMs : dur * 1000) - f.tMs;
    if (holdMs <= 0) continue;
    lines.push(`file '${f.file}'`);
    lines.push(`duration ${(holdMs / 1000).toFixed(4)}`);
  }
  // Repeating the final entry is how concat gives the last frame a duration.
  if (current.frames.length) lines.push(`file '${current.frames[current.frames.length - 1].file}'`);
  writeFileSync(join(current.dir, 'concat.txt'), lines.join('\n') + '\n');

  manifest.push({
    id: current.id,
    frames: current.frames.length,
    durationSec: Number(dur.toFixed(3)),
    targetSec: Number(current.target.toFixed(3))
  });
  console.log(`[clip ${current.id}] ${current.frames.length} frames, ${dur.toFixed(2)}s`);
  current = null;
}

async function chip(text) {
  const ok = await page.evaluate((t) => {
    const c = Array.from(document.querySelectorAll('.chip')).find((el) =>
      (el.getAttribute('data-text') || '').toLowerCase().includes(t.toLowerCase())
    );
    if (!c) return false;
    c.click();
    return true;
  }, text);
  if (!ok) throw new Error(`no suggested-prompt chip matching "${text}"`);
}

async function smoothScrollTo(selector) {
  await page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, selector);
  await sleep(900);
}

// ---------------------------------------------------------------------------
// Segment 2: the offline state, then a real handshake.
// Recorded first and from a cold page so the offline card is genuine, not a
// disconnect staged after the fact.
// ---------------------------------------------------------------------------
await page.goto('about:blank');
await page.evaluate(() => {});
await startClip('vo-02');
await page.goto(SIM, { waitUntil: 'domcontentloaded' });
await sleep(2600);
await page.evaluate(() => {
  const b = document.querySelector('.btn-reconnect, #btn-reconnect');
  if (b) b.click();
});
await sleep(1600);
await chip('ping HomeOps Guardian');
await sleep(2600);
await endClip();

// ---------------------------------------------------------------------------
// Segment 4: telemetry, then the staged plan and the gate.
// ---------------------------------------------------------------------------
await startClip('vo-04');
await chip("what's my home energy status");
await sleep(3400);
await chip('optimize high-draw appliances');
await sleep(3000);
await smoothScrollTo('.confirmation-gate-card');
await endClip();

// ---------------------------------------------------------------------------
// Segment 5: approval, the itemised result, and the reading afterwards.
// ---------------------------------------------------------------------------
await startClip('vo-05');
await sleep(1400);
await page.evaluate(() => {
  const b = document.querySelector('.btn-confirm');
  if (b) b.click();
});
await sleep(4200);
await chip('check status after optimization');
await sleep(3200);
await chip('optimize high-draw appliances');
await sleep(2800);
await smoothScrollTo('.confirmation-gate-card:last-of-type');
await endClip();

// ---------------------------------------------------------------------------
// Segment 6: the dataSource block, expanded in a tool card.
// ---------------------------------------------------------------------------
await startClip('vo-06');
await chip("what's my home energy status");
await sleep(2600);
await page.evaluate(() => {
  const headers = Array.from(document.querySelectorAll('.tool-step-header'));
  const last = headers[headers.length - 1];
  if (last) last.click();
});
await sleep(1200);
await page.evaluate(() => {
  const bodies = Array.from(document.querySelectorAll('.tool-step-body'));
  const last = bodies[bodies.length - 1];
  if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
await sleep(1400);
await page.evaluate(() => {
  const pre = Array.from(document.querySelectorAll('pre')).find((p) =>
    p.textContent && p.textContent.includes('dataSource')
  );
  if (pre) pre.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
await endClip();

writeFileSync(
  join(FRAMES, 'manifest.json'),
  JSON.stringify({ recordedAt: new Date().toISOString(), clips: manifest }, null, 2)
);

await browser.close();
console.log('\n[record] browser closed');
for (const c of manifest) console.log(`  ${c.id}  ${c.durationSec}s  ${c.frames} frames`);
