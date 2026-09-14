/**
 * Renders the still cards and the lower-third chapter titles at 1920x1080,
 * using headless Edge so the typography is real rather than drawn by ffmpeg
 * (which has no fontconfig on this machine and fails on drawtext).
 *
 *   node ops/video/generate-cards.mjs
 *
 * The probe card is special: it runs ops/probe-protocol-version.mjs against
 * the live server and renders that run's stdout verbatim. It cannot show a
 * result the server did not just produce, which is the point - the segment it
 * appears in is about measuring the claim rather than asserting it.
 */
import puppeteer from '../../apps/simulator/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'cards');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const probeOutput = execFileSync('node', [join(here, '..', 'probe-protocol-version.mjs')], {
  encoding: 'utf8'
});
writeFileSync(join(here, 'probe-captured.txt'), probeOutput);

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BASE = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1920px; height: 1080px; overflow: hidden;
    background: #080b12;
    color: #e8edf7;
    font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
    display: flex; align-items: center; justify-content: center;
  }
  .glow {
    position: absolute; inset: 0;
    background:
      radial-gradient(900px 520px at 22% 18%, rgba(56,189,248,0.14), transparent 62%),
      radial-gradient(760px 480px at 82% 84%, rgba(251,191,36,0.10), transparent 60%);
  }
  .wrap { position: relative; width: 1500px; }
  .kicker {
    font-size: 21px; letter-spacing: 0.34em; text-transform: uppercase;
    color: #7dd3fc; font-weight: 600; margin-bottom: 30px;
  }
  h1 { font-size: 104px; line-height: 1.02; letter-spacing: -0.028em; font-weight: 700; }
  .sub { font-size: 40px; color: #b7c4da; margin-top: 26px; line-height: 1.34; font-weight: 400; }
  .rule { height: 3px; width: 190px; background: linear-gradient(90deg, #38bdf8, rgba(56,189,248,0)); margin: 42px 0; }
  .meta { font-size: 25px; color: #8fa0bb; line-height: 1.85; }
  .meta strong { color: #dbe5f4; font-weight: 600; }
  .fine { font-size: 20px; color: #6b7c96; margin-top: 30px; line-height: 1.7; }
  code { font-family: "Cascadia Mono", Consolas, monospace; color: #fbbf24; }
`;

const PAGES = {
  'card-open': `
    <style>${BASE}</style>
    <div class="glow"></div>
    <div class="wrap">
      <div class="kicker">Amazon Developer Hackathon 2026 &middot; Alexa+ track</div>
      <h1>HomeOps Guardian</h1>
      <div class="sub">An MCP server that asks before it acts.</div>
      <div class="rule"></div>
      <div class="meta">
        <strong>Model Context Protocol</strong> &middot; Streamable HTTP, spec <code>2025-11-25</code><br>
        Household circuit telemetry, rate-aware load shifting,<br>
        and a confirmation gate nothing gets past.
      </div>
      <div class="fine">Atchayam G &middot; solo entrant</div>
    </div>`,

  'card-probe': `
    <style>${BASE}
      body { display: block; padding: 78px 92px; }
      h2 { font-size: 46px; font-weight: 700; letter-spacing: -0.02em; }
      .note { font-size: 24px; color: #8fa0bb; margin: 18px 0 34px; }
      pre {
        font-family: "Cascadia Mono", Consolas, monospace;
        /* 25px, not 27: the "Server not initialized" row is the widest line
           the probe emits and at 27px it reached the card's right edge. */
        font-size: 25px; line-height: 1.6; color: #cfe3ff;
        background: #05070c; border: 1px solid #1c2740; border-radius: 12px;
        padding: 34px 38px; white-space: pre; overflow: hidden;
      }
      .tag { color: #4ade80; }
    </style>
    <div class="glow"></div>
    <div>
      <h2>The protocol floor, measured</h2>
      <div class="note">Verbatim stdout from <code>node ops/probe-protocol-version.mjs</code>, captured against the running server while this video was built.</div>
      <pre>${esc(probeOutput.trim())}</pre>
    </div>`,

  'card-close': `
    <style>${BASE}</style>
    <div class="glow"></div>
    <div class="wrap">
      <h1>HomeOps Guardian</h1>
      <div class="sub">Built to the standard. Honest about the simulation.<br>It asks before it acts.</div>
      <div class="rule"></div>
      <div class="meta">
        Alexa+ track (primary) &middot; Open Source (mini)<br>
        <strong>Atchayam G</strong> &middot; Amazon Developer Hackathon 2026<br>
        <code>github.com/AtchayamG/homeops-guardian</code> &middot; MIT
      </div>
      <div class="fine">
        The household is simulated; every payload says so in its own dataSource block.<br>
        Narration synthesized with Microsoft Edge Neural TTS.
      </div>
    </div>`
};

const LOWER_THIRDS = [
  ['lt-02', 'A real transport', 'Handshake, session id, Streamable HTTP 2025-11-25'],
  ['lt-04', 'Nothing moves without a yes', 'The gate reads the plan out of the server\u2019s own response'],
  ['lt-05', 'Promised vs delivered', 'Computed from opposite directions, so a disagreement shows'],
  ['lt-06', 'Real, and modelled', 'Every figure carries a dataSource block']
];

const ltPage = (title, sub) => `
  <style>${BASE}
    body { background: transparent; display: block; }
    .lt {
      position: absolute; left: 84px; bottom: 96px;
      background: rgba(6, 10, 18, 0.93);
      border-left: 6px solid #38bdf8;
      border-radius: 0 14px 14px 0;
      padding: 30px 46px 32px 34px;
      box-shadow: 0 26px 70px rgba(0,0,0,0.6);
      max-width: 1180px;
    }
    .lt .t { font-size: 50px; font-weight: 700; letter-spacing: -0.02em; }
    .lt .s { font-size: 27px; color: #9fb2cc; margin-top: 12px; }
  </style>
  <div class="lt"><div class="t">${esc(title)}</div><div class="s">${esc(sub)}</div></div>`;

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--force-device-scale-factor=1', '--hide-scrollbars']
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

for (const [name, html] of Object.entries(PAGES)) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log('card', name);
}

for (const [name, title, sub] of LOWER_THIRDS) {
  await page.setContent(ltPage(title, sub), { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, `${name}.png`), omitBackground: true });
  console.log('lower third', name);
}

await browser.close();
console.log('\ncards written to', OUT);
