import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Why this suite exists.
 *
 * `npm start` runs `tsx src/index.ts`, so a developer starting the server by
 * hand always gets the current source. `ops/run-both-detached.cmd` used to
 * start `node dist\index.js` instead, and dist is a build artefact that is
 * gitignored and easy to leave stale. After the protocol floor was fixed in
 * src/server.ts without rebuilding, the two entry points disagreed:
 *
 *   ops\probe-protocol-version.mjs against the detached script
 *     client asks for 2024-11-05   200  2024-11-05     <- the old behaviour
 *   the same probe against npm start
 *     client asks for 2024-11-05   200  2025-11-25     <- the fixed behaviour
 *
 * Every test was green throughout, because the tests import the source. A
 * judge following the walkthrough would have been talking to a server this
 * repository no longer contains, and the README's protocol claim would have
 * been false in the only place it is actually checkable.
 *
 * The fix is one code path, and this suite is what keeps it that way.
 */
describe('ops scripts start the server from source, never from a build artefact', () => {
  // Resolved from cwd, not __dirname: this package is ESM ("type": "module")
  // and __dirname does not exist there. Jest runs with cwd at the package
  // root, services/mcp-server, so ops/ is two levels up.
  const opsDir = join(process.cwd(), '..', '..', 'ops');
  const scripts = readdirSync(opsDir).filter((f) => f.endsWith('.cmd'));

  it('finds the ops scripts at all (a silent empty list would pass everything)', () => {
    expect(scripts.length).toBeGreaterThan(0);
  });

  it.each(scripts)('%s does not launch node against dist/', (name) => {
    const body = readFileSync(join(opsDir, name), 'utf8');
    // Match the launch, not the word: a comment explaining the trap is fine,
    // and this suite's whole point is that the explanation should stay.
    const launchesDist = /^\s*(?!REM\b|::)[^\r\n]*\bnode\s+["']?dist[\\/]/im.test(body);
    expect(launchesDist).toBe(false);
  });
});
