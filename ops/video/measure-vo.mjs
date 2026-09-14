/**
 * Measures the narration files already in ops/video/vo and writes
 * vo-manifest.json. Split out from generate-tts.mjs so the manifest can be
 * rebuilt without re-synthesising seven segments over the network.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const VO = join(here, 'vo');

const files = readdirSync(VO).filter((f) => f.endsWith('.mp3')).sort();
const segments = files.map((f) => {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(VO, f)],
    { encoding: 'utf8' }
  );
  return { id: f.replace(/\.mp3$/, ''), file: `vo/${f}`, durationSec: Number(Number(out.trim()).toFixed(3)) };
});

const total = segments.reduce((s, m) => s + m.durationSec, 0);
writeFileSync(
  join(here, 'vo-manifest.json'),
  JSON.stringify(
    { voice: 'en-US-AndrewNeural', rate: '+6%', segments, totalSec: Number(total.toFixed(3)) },
    null,
    2
  )
);

for (const m of segments) console.log(`${m.id}  ${m.durationSec.toFixed(3)}s`);
console.log(`TOTAL ${total.toFixed(3)}s  (${(total / 60).toFixed(2)} min)`);
