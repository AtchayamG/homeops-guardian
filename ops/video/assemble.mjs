/**
 * Builds doorstep's sibling: docs/06-demo-submission/homeops-demo.mp4
 *
 *   ops\video\tts.cmd                  narration + measured durations
 *   node ops/video/generate-cards.mjs  stills, including the live probe capture
 *   ops\run-both-detached.cmd          both halves, from source
 *   node ops/video/record.mjs          screencast clips, paced to the narration
 *   node ops/video/assemble.mjs        this
 *
 * Structure. Card segments are stills held for their narration's length; app
 * segments are the recorded screencasts. Lower thirds fade in over the app
 * segments. All seven voice tracks are delayed to their segment's start and
 * mixed, then the whole thing is loudness-normalised.
 *
 * Every duration here comes from vo-manifest.json or from the recorder's own
 * manifest. Nothing in this file is a typed-in length, because a cut assembled
 * against guessed timings drifts out of sync with its own narration and the
 * only way to find out is to watch all of it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', '..', 'docs', '06-demo-submission');
const OUT = join(OUT_DIR, 'homeops-demo.mp4');
const WORK = join(here, 'work');
const CARDS = join(here, 'cards');
const FRAMES = join(here, 'frames');

if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const vo = JSON.parse(readFileSync(join(here, 'vo-manifest.json'), 'utf8'));
const rec = JSON.parse(readFileSync(join(FRAMES, 'manifest.json'), 'utf8'));

const voDur = (id) => vo.segments.find((s) => s.id === id).durationSec;
const clip = (id) => rec.clips.find((c) => c.id === id);

const PAD = 1.4; // must match record.mjs
const ff = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });

/**
 * The running order. `kind: 'card'` holds a still; `kind: 'clip'` plays the
 * screencast recorded for that segment. `lt` is the lower third to fade in.
 */
const TIMELINE = [
  { id: 'vo-01', kind: 'card', src: join(CARDS, 'card-open.png') },
  { id: 'vo-02', kind: 'clip', lt: join(CARDS, 'lt-02.png') },
  { id: 'vo-03', kind: 'card', src: join(CARDS, 'card-probe.png') },
  { id: 'vo-04', kind: 'clip', lt: join(CARDS, 'lt-04.png') },
  { id: 'vo-05', kind: 'clip', lt: join(CARDS, 'lt-05.png') },
  { id: 'vo-06', kind: 'clip', lt: join(CARDS, 'lt-06.png') },
  { id: 'vo-07', kind: 'card', src: join(CARDS, 'card-close.png') }
];

// ---------------------------------------------------------------------------
// 1. One normalised, silent 1080p60 piece per segment.
// ---------------------------------------------------------------------------
const pieces = [];
let cursor = 0;
const schedule = [];

for (const seg of TIMELINE) {
  const target = seg.kind === 'card' ? voDur(seg.id) + PAD : clip(seg.id).durationSec;
  const piece = join(WORK, `${seg.id}.mp4`);

  if (seg.kind === 'card') {
    ff([
      '-loop', '1', '-framerate', '60', '-t', String(target), '-i', seg.src,
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', '60', '-an', piece
    ]);
  } else {
    // The screencast frames carry their own per-frame durations in concat.txt,
    // so the clip plays back at the speed it was recorded rather than at an
    // assumed frame rate.
    const dir = join(FRAMES, seg.id);
    const base = [
      '-f', 'concat', '-safe', '0', '-i', 'concat.txt'
    ];
    const filters = [
      'scale=1920:1080:force_original_aspect_ratio=decrease',
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
      'format=yuv420p'
    ];
    if (seg.lt) {
      // Fade the lower third in at 0.8s and out 1.6s before the clip ends.
      const inAt = 0.8;
      const outAt = Math.max(inAt + 1.5, target - 1.6);
      // -loop 1 is not optional: a PNG input without it is a single frame, so
      // the overlay appears for one frame and vanishes. The first cut of this
      // video shipped that way and the lower thirds were invisible - caught by
      // pulling a frame out of the finished file and looking at it, which is
      // the only check that would have caught it.
      base.push('-loop', '1', '-framerate', '60', '-t', String(target), '-i', seg.lt);
      filters.length = 0;
      filters.push(
        '[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[base]',
        `[1:v]format=rgba,fade=t=in:st=${inAt}:d=0.45:alpha=1,fade=t=out:st=${outAt}:d=0.45:alpha=1[lt]`,
        '[base][lt]overlay=0:0:format=auto,format=yuv420p[v]'
      );
    }
    const args = [...base];
    if (seg.lt) {
      args.push('-filter_complex', filters.join(';'), '-map', '[v]');
    } else {
      args.push('-vf', filters.join(','));
    }
    args.push('-t', String(target), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', '60', '-an', piece);
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], {
      stdio: 'inherit',
      cwd: dir
    });
  }

  pieces.push(piece);
  schedule.push({ id: seg.id, startSec: Number(cursor.toFixed(3)), durSec: Number(target.toFixed(3)) });
  cursor += target;
}

// ---------------------------------------------------------------------------
// 2. Concatenate the silent video.
// ---------------------------------------------------------------------------
const listFile = join(WORK, 'pieces.txt');
writeFileSync(listFile, pieces.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n');
const silent = join(WORK, 'silent.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent]);

// ---------------------------------------------------------------------------
// 3. Mix the narration onto it, each track delayed to its segment's start.
// ---------------------------------------------------------------------------
const audioInputs = [];
const audioFilters = [];
schedule.forEach((s, i) => {
  audioInputs.push('-i', join(here, 'vo', `${s.id}.mp3`));
  // +0.25s so a segment's first word lands just after its cut, not on it.
  const delayMs = Math.round((s.startSec + 0.25) * 1000);
  audioFilters.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs}[a${i}]`);
});
const mix =
  audioFilters.join(';') +
  ';' +
  schedule.map((_, i) => `[a${i}]`).join('') +
  `amix=inputs=${schedule.length}:normalize=0[mixed];` +
  '[mixed]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]';

execFileSync(
  'ffmpeg',
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', silent,
    ...audioInputs,
    '-filter_complex', mix,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-shortest', OUT
  ],
  { stdio: 'inherit' }
);

// ---------------------------------------------------------------------------
// 4. Report the cut against the limit.
// ---------------------------------------------------------------------------
const dur = Number(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', OUT], {
    encoding: 'utf8'
  }).trim()
);

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.round((s % 1) * 10))}`;
console.log('\nrunning order');
for (const s of schedule) console.log(`  ${s.id}  ${mmss(s.startSec).padStart(8)}  +${s.durSec}s`);
console.log(`\nTOTAL ${mmss(dur)}  (${dur.toFixed(3)}s)`);
console.log(dur <= 180 ? 'limit 3:00 - UNDER' : 'limit 3:00 - OVER, trim the narration');
writeFileSync(join(here, 'timeline.json'), JSON.stringify({ schedule, totalSec: dur }, null, 2));
console.log('\nwrote', OUT);
