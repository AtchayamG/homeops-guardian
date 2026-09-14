import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * This suite lives in the server package because the server package is what
 * `ops\test.cmd` runs, and the rule it enforces is about the client. That is
 * deliberate: the rule needs to run, and a test nobody runs is a comment.
 *
 * What it prevents.
 *
 * The confirmation gate is the only surface in this project that asks a person
 * to consent to something. Consent is to the plan *as described*, so the gate
 * must describe the plan the server actually staged. It did not. The gate card
 * had the plan typed into its HTML:
 *
 *   <span class="breakdown-label">Tesla EV Wall Connector:</span>
 *   <span class="breakdown-val">PAUSE CHARGING (Shed 7.2 kW)</span>
 *   <span class="breakdown-label">Heat Pump HVAC:</span>
 *   <span class="breakdown-val">ECO SETPOINT +2°F (Shed 2.4 kW)</span>
 *
 * while the real payload carries a `proposedActions` array. The totals fell
 * back to `|| 9.6` and `: '42.50'`, and the spoken confirmation used
 * `|| 3.8` and `|| 4.61`. All four literals matched what the server sends
 * today, which is exactly why this survived review: the screen was right by
 * coincidence. Change the server's plan and the gate would have gone on
 * describing the old one, and `ops/verify-gate.mjs` would not have noticed,
 * because it checks the server over MCP and never looks at the DOM.
 *
 * Every figure on screen must come from a tool result. Absent means the screen
 * says absent.
 */
describe('the simulator never invents a figure the server did not send', () => {
  const mainTs = join(process.cwd(), '..', '..', 'apps', 'simulator', 'src', 'main.ts');
  const source = readFileSync(mainTs, 'utf8');

  it('reads the client source at all (an empty string would pass everything)', () => {
    expect(source.length).toBeGreaterThan(1000);
  });

  // Strip block comments and single-line comments before scanning: the
  // explanations above and in main.ts quote the old code on purpose, and the
  // point of keeping them is that the next reader learns why the rule exists.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('has no numeric || fallback anywhere', () => {
    const hits = code.match(/\|\|\s*'?-?\d[\d.]*/g) ?? [];
    expect(hits).toEqual([]);
  });

  it('has no ?? fallback to a number either', () => {
    const hits = code.match(/\?\?\s*'?-?\d[\d.]*/g) ?? [];
    expect(hits).toEqual([]);
  });

  it.each([
    'Tesla EV Wall Connector',
    'Heat Pump HVAC',
    'Tesla EV Charger'
  ])('does not hardcode the appliance name %s', (name) => {
    expect(code).not.toContain(name);
  });

  it('does not hardcode a tariff rate in the gate copy', () => {
    // The rate is modelled and belongs in a dataSource-carrying payload, not
    // typed into the surface that asks someone to approve a change.
    expect(code).not.toMatch(/\$0\.\d+\s*\/?\s*kWh/);
  });

  it('renders the proposed actions the server sent', () => {
    expect(code).toContain('proposedActions');
  });

  it('says so when a field is missing instead of filling it in', () => {
    expect(code).toContain('not reported by the server');
  });

  it('labels the money figure as modelled', () => {
    expect(code.toLowerCase()).toContain('modelled');
  });
});
