import puppeteer from '../apps/simulator/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT_DIR = resolve('D:/Work/Codex/Hackathon Projects/Amazon Developer Hackathon/projects/03-alexa-mcp');
const SCREENSHOT_DIR = join(ROOT_DIR, 'docs/assets/screenshots');

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function getBrowserPath() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (existsSync(edgePath)) return edgePath;
  if (existsSync(chromePath)) return chromePath;
  throw new Error('Neither Edge nor Chrome found');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function sha256(filePath) {
  const buffer = readFileSync(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function run() {
  console.log('[Evidence] Starting evidence capture pipeline...');
  const browserPath = getBrowserPath();
  console.log(`[Evidence] Using browser: ${browserPath}`);

  // Step 1: Start Vite Preview server for Simulator
  console.log('[Evidence] Starting Vite server on 127.0.0.1:5173...');
  const viteProcess = spawn(
    'npm',
    ['run', 'preview'],
    {
      cwd: join(ROOT_DIR, 'apps/simulator'),
      stdio: 'pipe',
      shell: true
    }
  );

  viteProcess.stdout.on('data', d => console.log(`[Vite stdout] ${d.toString().trim()}`));
  viteProcess.stderr.on('data', d => console.error(`[Vite stderr] ${d.toString().trim()}`));

  await sleep(3000);

  // Step 2: Launch Headless Browser (MCP Server is OFFLINE)
  console.log('[Evidence] Testing Scenario 1: MCP Server OFFLINE...');
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    defaultViewport: { width: 1400, height: 900 }
  });

  const page = await browser.newPage();
  page.on('console', msg => console.log(`[Browser Console ${msg.type()}]`, msg.text()));
  page.on('pageerror', err => console.error('[Browser PageError]', err));
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0' });
  await sleep(1500);

  const shot1 = join(SCREENSHOT_DIR, '01-server-offline.png');
  await page.screenshot({ path: shot1, fullPage: false });
  console.log(`[Evidence] Captured: ${shot1} (SHA256: ${sha256(shot1)})`);

  // Step 3: Start Real MCP Server on 127.0.0.1:3001
  console.log('[Evidence] Starting Real MCP Server on 127.0.0.1:3001...');
  const mcpProcess = spawn(
    'node',
    ['dist/index.js'],
    {
      cwd: join(ROOT_DIR, 'services/mcp-server'),
      stdio: 'pipe',
      shell: true
    }
  );

  mcpProcess.stdout.on('data', d => console.log(`[MCP stdout] ${d.toString().trim()}`));
  mcpProcess.stderr.on('data', d => console.error(`[MCP stderr] ${d.toString().trim()}`));

  await sleep(3000);

  // Step 4: Scenario 2: Connected Handshake
  console.log('[Evidence] Testing Scenario 2: Handshake & Connected State...');
  await page.click('#btn-retry-conn');
  await sleep(2500);

  const shot2 = join(SCREENSHOT_DIR, '02-handshake-connected.png');
  await page.screenshot({ path: shot2, fullPage: false });
  console.log(`[Evidence] Captured: ${shot2} (SHA256: ${sha256(shot2)})`);

async function sendUtterance(page, text) {
  await page.waitForFunction(() => {
    const input = document.getElementById('user-input');
    return input && !input.disabled;
  }, { timeout: 15000 });

  await page.evaluate((msg) => {
    const input = document.getElementById('user-input');
    const form = document.getElementById('input-form');
    input.value = msg;
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, text);

  await sleep(600);

  await page.waitForFunction(() => {
    const input = document.getElementById('user-input');
    return input && !input.disabled;
  }, { timeout: 15000 });
  await sleep(1000);
}

  try {
    // Step 5: Scenario 3: Call Ping & Circuit Telemetry
    console.log('[Evidence] Testing Scenario 3: Ping & Circuit Telemetry tools...');
    await sendUtterance(page, 'Alexa, ping HomeOps Guardian');
    await sendUtterance(page, "Alexa, what's my home energy status?");

    const shot3 = join(SCREENSHOT_DIR, '03-conversation-tools.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log(`[Evidence] Captured: ${shot3} (SHA256: ${sha256(shot3)})`);

    // Step 6: Scenario 4: Stage Load Shift -> Human Confirmation Gate
    console.log('[Evidence] Testing Scenario 4: Stage Load Shift -> Human Confirmation Gate...');
    await sendUtterance(page, 'Alexa, optimize high-draw appliances for peak rates');

    await page.waitForSelector('.confirmation-gate-card', { timeout: 10000 });
    await sleep(1000);

    // Scroll transcript to show the confirmation gate clearly
    await page.evaluate(() => {
      const scrollEl = document.getElementById('transcript-scroll');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    await sleep(1000);

    const shot4 = join(SCREENSHOT_DIR, '04-confirmation-gate.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log(`[Evidence] Captured: ${shot4} (SHA256: ${sha256(shot4)})`);

    // Step 7: Scenario 5: User Approves -> Execute Confirm Load Shift -> Post-Verification + Protocol Inspector
    console.log('[Evidence] Testing Scenario 5: User Approves Load Shift & Protocol Inspector...');
    await page.evaluate(() => {
      const approveBtn = document.querySelector('.confirmation-gate-card .btn-confirm');
      if (approveBtn) approveBtn.click();
    });
    await page.waitForSelector('.gate-status-resolved.executed', { timeout: 10000 });
    await sleep(2000);

    // Verify post-optimization status
    await sendUtterance(page, 'Alexa, check status after optimization');

    // Scroll transcript to bottom
    await page.evaluate(() => {
      const scrollEl = document.getElementById('transcript-scroll');
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
    await sleep(1000);

    // Ensure inspector is open to see network audit log
    const inspectorVisible = await page.evaluate(() => {
      const el = document.getElementById('protocol-inspector');
      return el && !el.classList.contains('collapsed');
    });
    if (!inspectorVisible) {
      await page.evaluate(() => {
        const toggle = document.getElementById('btn-toggle-inspector');
        if (toggle) toggle.click();
      });
      await sleep(800);
    }

    const shot5 = join(SCREENSHOT_DIR, '05-action-confirmed-telemetry.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log(`[Evidence] Captured: ${shot5} (SHA256: ${sha256(shot5)})`);

    // Step 8: Extract Captured Network Log from UI
    const auditLogs = await page.evaluate(() => {
      return window.auditEntries || [];
    });

    const auditPath = join(ROOT_DIR, 'ops/network-audit.json');
    writeFileSync(auditPath, JSON.stringify(auditLogs, null, 2), 'utf8');
    console.log(`[Evidence] Saved ${auditLogs.length} network audit entries to ${auditPath}`);
    console.log('[Evidence] Evidence capture completed successfully!');
  } catch (err) {
    console.error('[Evidence ERROR inside scenarios]:', err);
    const errShot = join(SCREENSHOT_DIR, 'debug-error.png');
    await page.screenshot({ path: errShot, fullPage: true });
    console.log(`[Evidence] Saved debug screenshot: ${errShot}`);
    throw err;
  } finally {
    console.log('[Evidence] Tearing down browser and servers...');
    try { await browser.close(); } catch {}
    try { viteProcess.kill(); } catch {}
    try { mcpProcess.kill(); } catch {}
    process.exit(0);
  }
}

run().catch(err => {
  console.error('[Evidence ERROR]', err);
  process.exit(1);
});
