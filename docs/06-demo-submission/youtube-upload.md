# YouTube upload — HomeOps Guardian demo video

**File**: `docs/06-demo-submission/homeops-demo.mp4` (12.8 MB, 163.000s = 2:43.0,
1920x1080 @ 60fps, AAC 48 kHz stereo, mean −19.5 dB / peak −4.4 dB, no silence
gap over 4s)

17 seconds under the 3:00 hard limit.

## Visibility

**Public.** The rules require a publicly viewable video and a judge following the
Devpost link must not hit a sign-in wall.

## Title

```
HomeOps Guardian — an MCP server for Alexa+ that asks before it acts
```

## Description

```
HomeOps Guardian is a Model Context Protocol server that lets a conversational
assistant read a household's electrical circuits and shift load away from peak
tariff hours — and will not touch a breaker without a human saying yes.

It does not run on an Echo. Nothing can, yet: Amazon's own Alexa+ add-on console
renders "Coming Soon" (checked signed-in, 2026-09-14), and Amazon's developer
relations team said on the hackathon build session that you cannot take an SDK
and control an Echo Show today. So this is the server, built to the plain MCP
Streamable HTTP standard at spec version 2025-11-25, with a web client standing
in for Alexa+ — which is what Amazon's own teams demonstrated with.

0:00  What this is, and what it cannot be
0:24  A real transport — handshake, session id, Streamable HTTP 2025-11-25
0:44  The protocol floor, measured — captured live, not asserted
1:08  Nothing moves without a yes — the confirmation gate
1:40  Promised vs delivered, computed from opposite directions
2:10  What is real here, and what is modelled
2:36  Close

Three things this demo is actually about:

1. THE PROTOCOL FLOOR WAS FALSE, TWICE. The rules set a minimum spec version, so
we measured it instead of claiming it. A client asking for 2024-11-05 was
answered 2024-11-05. Fixed, six tests pin it. Then it came back a different way:
two of our own ops scripts started the server from a compiled build that
predated the fix, so the probe reported the old behaviour while every test
stayed green — because the tests import the source. A judge following our own
walkthrough would have been talking to a server the repository no longer
contained. Both scripts now run from source and a test reads the batch files to
keep it that way. It immediately caught a second offender.

2. THE CONFIRMATION GATE USED TO DESCRIBE A PLAN IT WAS NOT GOING TO RUN. The
card that asks you to approve a change had the plan typed into its HTML, while
the server's response carries a proposedActions array. It looked correct because
the hardcoded numbers happened to match what the server sends. Consent is to the
plan as described, so a gate whose description and effect are independent
constants is a gate in name only. Now staging derives every reduction from each
circuit's current draw, execution walks the staged plan and reports what it
applied per circuit with before/after, and promised-vs-delivered are computed
from opposite directions so a disagreement would be visible. The test that
would have caught it: stage a second plan after the shift has run and it must
propose LESS, because the charger is already paused.

3. NO FIGURE PRETENDS TO BE REAL. The server, the transport, the session
handling, the tool schemas and the gate are real and tested — 48 tests across 5
suites. The household is not: no smart panel, no CT clamp, no meter, no utility
feed. Every payload carrying a number carries a dataSource block saying so,
including an instruction not to present the figures to anyone as their bill. An
earlier version did not, and it read as a live rate quote from a named utility;
that is written up in the friction log. The monthly saving figure now carries
the arithmetic that produced it.

Amazon "Build, Ship, Shape" Developer Hackathon 2026
Track: Alexa+ (primary) · Mini: Open Source
Entrant: Atchayam G (solo)

Code (MIT): https://github.com/AtchayamG/homeops-guardian

The narration is synthesized with Microsoft Edge Neural TTS, as the closing card
states. The protocol-floor card in the video is verbatim stdout from
ops/probe-protocol-version.mjs, captured against the running server while the
video was built.
```

## Tags

```
Model Context Protocol, MCP, Alexa, Alexa Plus, smart home, energy, time of use
tariff, load shifting, TypeScript, human in the loop, hackathon
```

## Settings that matter

- **Audience**: "No, it's not made for kids"
- **Altered content / synthetic media**: **Yes** — the narration voice is
  synthesized. Disclosing it is consistent with the submission's whole argument.
- **Category**: Science & Technology
- **Comments**: leave on

## After upload

Paste the watch URL back and it goes into:
1. The Devpost submission's video field
2. The P3 README, under the badges
3. `docs/06-demo-submission/walkthrough.md`, next to the local file reference
