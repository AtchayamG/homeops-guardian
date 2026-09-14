/**
 * Drives the simulator through the judge-facing walkthrough in a real browser
 * and saves a full screenshot at each beat, so the demo script can be written
 * against what the screen actually shows rather than against the source.
 *
 * Needs both halves already running: ops\run-both-detached.cmd
 *
 *   node ops/video/inspect.mjs
 *
 * Prints the visible text of the last Alexa turn after each step, which is
 * what catches a claim on screen that no tool result supports.
 */
import puppeteer from '../../apps/simulator/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, 'shots');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SIM = 'http://127.0.0.1:5173/';

if (existsSync(SHOTS)) rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

await page.goto(SIM, { waitUntil: 'networkidle0' });
await sleep(1500);

let n = 0;
async function shot(name) {
  const file = join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('shot', file);
}

async function lastAlexaText() {
  return page.evaluate(() => {
    const bubbles = document.querySelectorAll('.alexa-bubble');
    const last = bubbles[bubbles.length - 1];
    return last ? last.innerText.replace(/\s+/g, ' ').trim() : '(no alexa bubble)';
  });
}

async function say(chipText) {
  const clicked = await page.evaluate((t) => {
    const chip = Array.from(document.querySelectorAll('.chip')).find((c) =>
      (c.getAttribute('data-text') || '').toLowerCase().includes(t.toLowerCase())
    );
    if (!chip) return false;
    chip.click();
    return true;
  }, chipText);
  if (!clicked) throw new Error(`no chip matching: ${chipText}`);
  await sleep(2600);
}

await shot('initial');
console.log(
  'status:',
  await page.evaluate(
    () => document.querySelector('.status-label')?.textContent?.trim() ?? '(none)'
  )
);

await say('ping HomeOps Guardian');
await shot('ping');
console.log('\nPING ->', await lastAlexaText());

await say("what's my home energy status");
await shot('telemetry');
console.log('\nTELEMETRY ->', await lastAlexaText());

await say('why is electricity so expensive');
await shot('tariff');
console.log('\nTARIFF ->', await lastAlexaText());

await say('optimize high-draw appliances');
await sleep(1200);
await shot('gate');
console.log('\nSTAGED ->', await lastAlexaText());
console.log(
  '\nGATE CARD ->',
  await page.evaluate(() => {
    const g = document.querySelector('.confirmation-gate-card');
    return g ? g.innerText.replace(/\n+/g, ' | ').trim() : '(no gate card)';
  })
);

const approved = await page.evaluate(() => {
  const btn = document.querySelector('.btn-confirm');
  if (!btn) return false;
  btn.click();
  return true;
});
if (!approved) throw new Error('no approve button on the gate card');
await sleep(3200);
await shot('approved');
console.log('\nAPPROVED ->', await lastAlexaText());

await say('check status after optimization');
await shot('after');
console.log('\nAFTER ->', await lastAlexaText());

await browser.close();
console.log('\nbrowser closed');
