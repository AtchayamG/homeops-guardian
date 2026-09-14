/**
 * Synthesises the narration segments with Microsoft Edge Neural TTS and
 * measures each one, so the recorder can hold each beat for exactly as long as
 * its voiceover lasts instead of against a guessed duration.
 *
 *   node ops/video/generate-tts.mjs
 *
 * Writes ops/video/vo/vo-NN.mp3 and ops/video/vo-manifest.json.
 *
 * The voice is a synthesizer and the script is written in the third person on
 * purpose: this submission is about disclosure, so the narration does not claim
 * to be the entrant speaking. The closing card says the narration is
 * synthesized.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const VO = join(here, 'vo');
if (!existsSync(VO)) mkdirSync(VO, { recursive: true });

const VOICE = 'en-US-AndrewNeural';
const RATE = '+6%';

/**
 * A first pass of this script ran 211.8 seconds of narration against a 180
 * second hard limit. These are the trimmed texts. What was cut was
 * explanation; what was kept is the three things only this project can say -
 * the floor that was false twice, the gate that described a plan it was not
 * going to run, and the line between what is real here and what is modelled.
 */
export const SEGMENTS = [
  {
    id: 'vo-01',
    text:
      'HomeOps Guardian is an M C P server that lets a conversational assistant read a household\'s electrical circuits and shift load off peak tariff hours. It will not touch a breaker without a human saying yes. ' +
      'It does not run on an Echo. Nothing can, yet: Amazon\'s own add-on console reads Coming Soon. So this is the server, built to the plain standard, with a client standing in for Alexa Plus.'
  },
  {
    id: 'vo-02',
    text:
      'With the server down, the client says so, and says what to run. No empty conversation pretending to work. ' +
      'With it up: a real handshake, a session id the server issued, Streamable H T T P at spec version twenty twenty five, eleven, twenty five. Every call in this demo is in that audit panel.'
  },
  {
    id: 'vo-03',
    text:
      'The rules set a minimum spec version, so we measured it instead of asserting it. It was false: a client asking for an older version was answered with that older version. Fixed, and six tests pin it. ' +
      'Then it came back, because two of our own scripts started the server from a compiled build that predated the fix. This probe reported the old behaviour while every test stayed green, since the tests import the source.'
  },
  {
    id: 'vo-04',
    text:
      'Asked to optimise, the assistant calls stage load shift and gets back a plan, not an action. The gate lists what it intends to do, circuit by circuit, read out of that response: the circuit ids, the kilowatts, the server\'s own words for each step. ' +
      'It did not, this morning. The plan was typed into this card\'s H T M L, and it looked right because the hardcoded numbers happened to match what the server sends. Consent is to the plan as described, so a gate that describes something other than what it runs is a gate in name only.'
  },
  {
    id: 'vo-05',
    text:
      'Before approval, every circuit is where it was. Approve, and the server reports what it applied: each circuit, its draw before and after. The household total drops by what the plan promised. ' +
      'Promised and delivered are computed from opposite directions, one from the plan and one from before minus after, so a disagreement would show. ' +
      'Stage a second plan now and it proposes zero kilowatts, because the charger is already paused. A hardcoded plan would offer the same nine point six again.'
  },
  {
    id: 'vo-06',
    text:
      'Plainly: the server, the transport, the session handling and the gate are real and tested. Forty eight tests, five suites. The household is not. No panel, no clamp, no meter, no utility feed, and every payload with a number in it carries a data source block saying so, and saying not to present these figures as anyone\'s bill. ' +
      'We shipped a version that did not, and it read as a live rate quote from a named utility.'
  },
  {
    id: 'vo-07',
    text:
      'HomeOps Guardian. Built to the standard, honest about the simulation, and it asks before it acts.'
  }
];

function durationSec(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' }
  );
  return Number(out.trim());
}

const manifest = [];
for (const seg of SEGMENTS) {
  const file = join(VO, `${seg.id}.mp3`);
  console.log(`[tts] ${seg.id} (${seg.text.length} chars)`);
  execFileSync(
    'python',
    ['-m', 'edge_tts', '--voice', VOICE, '--rate', RATE, '--text', seg.text, '--write-media', file],
    { stdio: 'inherit' }
  );
  const dur = durationSec(file);
  manifest.push({ id: seg.id, file: `vo/${seg.id}.mp3`, durationSec: Number(dur.toFixed(3)) });
  console.log(`      ${dur.toFixed(3)}s`);
}

const total = manifest.reduce((s, m) => s + m.durationSec, 0);
writeFileSync(
  join(here, 'vo-manifest.json'),
  JSON.stringify({ voice: VOICE, rate: RATE, segments: manifest, totalSec: Number(total.toFixed(3)) }, null, 2)
);

console.log('\nsegments:');
for (const m of manifest) console.log(`  ${m.id}  ${m.durationSec.toFixed(3)}s`);
console.log(`\nTOTAL narration ${total.toFixed(3)}s`);
console.log(total > 174 ? 'OVER BUDGET - trim the script' : 'within the 3:00 limit with room for pauses');
