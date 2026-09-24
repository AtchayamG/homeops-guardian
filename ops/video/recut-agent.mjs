// Re-cut 2026-09-24. The published cut (2026-09-15) showed a keyword router and an in-page Approve button;
// since P3-01/P3-02 the stand-in for Alexa+ is a Bedrock Nova Pro agent and the gate is MCP elicitation.
// This script keeps 0:00-1:08 of the published cut (intro, transport, protocol-floor probe) unchanged,
// records the agent flow live, and reuses the published closing card + closing narration.
//   node ops/video/recut-agent.mjs      (needs AWS credentials for Bedrock via the default chain)
import puppeteer from '../../apps/simulator/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const D = dirname(fileURLToPath(import.meta.url));
const ROOT = join(D, '../..');
const W = join(D, 'work', 'recut'); const FR = join(W, 'frames');
if (existsSync(FR)) rmSync(FR, { recursive: true, force: true });
mkdirSync(FR, { recursive: true });
const SRC = join(ROOT, 'docs/06-demo-submission/homeops-demo.mp4');
const OUT = join(W, 'homeops-demo-v2.mp4');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CUT_A = 68.2;   // vo-04 began at 68.41 s in the published cut
const TAIL_AT = 156.7; // vo-07 (closing) began at 156.95 s
const UTTERANCE = 'My EV charger is making the bill huge, can you do something tonight?';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dur = (f) => parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`, { encoding: 'utf8' }));
const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });

const SEGS = [
  { id: 'vo-04n', lt: ['The server asks the human', 'Bedrock Nova Pro plans; MCP elicitation asks you'],
    text: 'Since the last cut, the stand-in for Alexa Plus is a real agent: Amazon Bedrock, Nova Pro, which can only use the tools this M C P server lists. Given an off-script sentence, it reads the circuit telemetry and stages a load shift. Staging changes nothing. To confirm, the server itself asks the human, through M C P elicitation, and shows the exact plan it will run.' },
  { id: 'vo-05n', lt: ['The model cannot approve its own plan', 'The final line is written from the server\u2019s result'],
    text: "The model cannot answer that question for itself. Make the server trust the model's own confirmed flag instead of the human's answer, and seven of eight gate tests fail. Approve, and the server reports what it applied. The final line is written from the server's result, not from the model's words: circuits changed, and kilowatts delivered against kilowatts promised. Decline, and it says nothing changed." },
  { id: 'vo-06n', lt: ['Real, and modelled', '57 server tests \u00b7 9 agent tests \u00b7 every figure carries a dataSource block'],
    text: 'Plainly: the server, the transport, the elicitation gate and the Bedrock agent are real and tested, with fifty seven server tests and nine agent tests. The household is not. No panel, no meter, no utility feed, and every payload with a number in it carries a data source block saying so.' }
];

// 1. Narration (same voice and rate as the published cut) and lower thirds.
for (const s of SEGS) {
  writeFileSync(join(W, `${s.id}.txt`), s.text);
  s.file = join(W, `${s.id}.mp3`);
  execFileSync('python', ['-m', 'edge_tts', '--voice', 'en-US-AndrewNeural', '--rate=+6%', '--file', join(W, `${s.id}.txt`), '--write-media', s.file], { stdio: 'ignore' });
  s.dur = dur(s.file);
}
let t = 0.4;
for (const s of SEGS) { s.start = t; t += s.dur + 0.6; }
const TOTAL_B = t + 0.2;

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--window-size=1920,1080', '--force-device-scale-factor=1', '--hide-scrollbars'] });
const cardPage = await browser.newPage();
await cardPage.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
for (const s of SEGS) {
  await cardPage.setContent(`<html><body style="margin:0;width:1920px;height:1080px;background:transparent;font-family:'Segoe UI',Arial,sans-serif;color:#e8eef8">
    <div style="position:absolute;left:84px;bottom:96px;background:rgba(6,10,18,.93);border-left:6px solid #38bdf8;border-radius:0 14px 14px 0;padding:30px 46px 32px 34px;box-shadow:0 26px 70px rgba(0,0,0,.6);max-width:1180px">
    <div style="font-size:50px;font-weight:700;letter-spacing:-.02em">${s.lt[0]}</div><div style="font-size:27px;color:#9fb2cc;margin-top:12px">${s.lt[1]}</div></div></body></html>`);
  s.png = join(W, `lt-${s.id}.png`);
  await cardPage.screenshot({ path: s.png, omitBackground: true });
}
await cardPage.close();

// 2. Live services: MCP server, Bedrock agent, simulator.
const procs = [
  spawn('npm', ['start'], { cwd: join(ROOT, 'services/mcp-server'), shell: true, stdio: 'ignore' }),
  spawn('npm', ['start'], { cwd: join(ROOT, 'services/agent'), shell: true, stdio: 'ignore' }),
  spawn('npx', ['vite', '--port', '5173', '--host', '127.0.0.1', '--strictPort'], { cwd: join(ROOT, 'apps/simulator'), shell: true, stdio: 'ignore' })
];
const up = async (url) => { for (let i = 0; i < 90; i++) { try { await fetch(url); return; } catch {} await sleep(500); } throw new Error('not up: ' + url); };
const facts = {};
try {
  await up('http://127.0.0.1:3001/health'); await up('http://127.0.0.1:3003/health'); await up('http://127.0.0.1:5173/');
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => /Agent connected/.test(document.getElementById('status-label')?.textContent || ''), { timeout: 20000 });
  const client = await page.target().createCDPSession();
  const frames = []; let idx = 0, rec = true, t0 = 0;
  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    if (!rec) return;
    const f = `frame_${String(idx++).padStart(6, '0')}.jpg`;
    writeFileSync(join(FR, f), Buffer.from(data, 'base64'));
    frames.push({ f, ms: t0 ? Date.now() - t0 : 0 });
    try { await client.send('Page.screencastFrameAck', { sessionId }); } catch {}
  });
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  t0 = Date.now();
  const at = async (sec) => { const r = sec * 1000 - (Date.now() - t0); if (r > 0) await sleep(r); };
  const tick = setInterval(() => page.evaluate(() => document.body.setAttribute('data-tick', String(Date.now()))).catch(() => {}), 250);

  await at(0.8);
  await page.type('#user-input', UTTERANCE, { delay: 28 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.confirmation-gate-card .btn-confirm', { timeout: 60000 });
  facts.cardAt = (Date.now() - t0) / 1000;
  const show = (sel) => page.evaluate((q) => { const els = document.querySelectorAll(q); els[els.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, sel);
  await page.evaluate(() => { window.__pin = setInterval(() => { const sc = document.getElementById('transcript-scroll'); const m = document.getElementById('messages-container');
    sc.scrollTop += m.getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom + 40; }, 150); });
  await at(Math.max(SEGS[1].start + 0.8, facts.cardAt + 1));
  await page.click('.confirmation-gate-card .btn-confirm');
  await page.waitForFunction(() => [...document.querySelectorAll('.alexa-bubble')].some((b) => /^(Done\.|You declined|Approval timed out|This client cannot|The server returned)/.test(b.textContent.trim())), { timeout: 60000 });
  facts.finalAt = (Date.now() - t0) / 1000;
  facts.finalText = await page.evaluate(() => [...document.querySelectorAll('.alexa-bubble')].pop()?.textContent.trim());
  facts.bedrockRequests = await page.evaluate(() => [...document.querySelectorAll('.tool-step-card strong')].filter((s) => s.textContent === 'Bedrock request').length);
  await at(SEGS[2].start + 0.5);
  await page.evaluate(() => document.getElementById('protocol-inspector')?.classList.remove('collapsed'));
  await at(TOTAL_B);
  clearInterval(tick); rec = false;
  await client.send('Page.stopScreencast');
  const lines = [];
  const kept = []; let lastMs = -1e9;
  for (const x of frames) if (x.ms - lastMs >= 33) { kept.push(x); lastMs = x.ms; }
  kept.forEach((x, i) => { const n = kept[i + 1]; lines.push(`file 'frames/${x.f}'`, `duration ${(n ? (n.ms - x.ms) / 1000 : 1).toFixed(4)}`); });
  lines.push(`file 'frames/${kept[kept.length - 1].f}'`);
  facts.captureSec = +(kept[kept.length - 1].ms / 1000).toFixed(2); facts.framesKept = kept.length;
  writeFileSync(join(W, 'concat.txt'), lines.join('\n'));
} finally {
  await browser.close().catch(() => {});
  for (const p of procs) { try { execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' }); } catch {} }
}
if (!facts.finalText || !facts.finalText.startsWith('Done.')) throw new Error('Live run did not end in a verified execution: ' + facts.finalText);

// 3. Assemble: published head + new live segment + published closing.
const ENC = '-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2';
const LN = 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000';
run(`ffmpeg -y -i "${SRC}" -t ${CUT_A} ${ENC} "${join(W, 'partA.mp4')}"`);
const inputs = [`-f concat -safe 0 -i "${join(W, 'concat.txt')}"`, ...SEGS.map((s) => `-loop 1 -framerate 30 -i "${s.png}"`), ...SEGS.map((s) => `-i "${s.file}"`)];
let fc = `[0:v]fps=30,scale=1920:1080:flags=lanczos,format=yuv420p,tpad=stop_mode=clone:stop_duration=5,trim=duration=${TOTAL_B.toFixed(3)},setpts=PTS-STARTPTS[v0];`;
SEGS.forEach((s, i) => {
  const a = s.start.toFixed(2), b = (s.start + s.dur).toFixed(2);
  fc += `[${i + 1}:v]format=rgba,fade=t=in:st=${a}:d=0.4:alpha=1,fade=t=out:st=${(s.start + s.dur - 0.4).toFixed(2)}:d=0.4:alpha=1[l${i}];[v${i}][l${i}]overlay=0:0:shortest=1:enable='between(t,${a},${b})'[v${i + 1}];`;
});
SEGS.forEach((s, i) => { fc += `[${i + 4}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(s.start * 1000)}:all=1[a${i}];`; });
fc += `[a0][a1][a2]amix=inputs=3:normalize=0:dropout_transition=0,${LN},apad,atrim=duration=${TOTAL_B.toFixed(3)}[aout]`;
run(`ffmpeg -y ${inputs.join(' ')} -filter_complex "${fc}" -map "[v3]" -map "[aout]" -t ${TOTAL_B.toFixed(3)} ${ENC} "${join(W, 'partB.mp4')}"`);
run(`ffmpeg -y -ss ${TAIL_AT} -i "${SRC}" ${ENC} "${join(W, 'partC.mp4')}"`);
run(`ffmpeg -y -i "${join(W, 'partA.mp4')}" -i "${join(W, 'partB.mp4')}" -i "${join(W, 'partC.mp4')}" -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]" -map "[v]" -map "[a]" ${ENC} -movflags +faststart "${OUT}"`);
facts.segments = SEGS.map((s) => ({ id: s.id, start: +s.start.toFixed(2), dur: +s.dur.toFixed(2) }));
facts.total = +dur(OUT).toFixed(2);
writeFileSync(join(W, 'recut-facts.json'), JSON.stringify(facts, null, 2));
console.log('[recut]', JSON.stringify(facts));
