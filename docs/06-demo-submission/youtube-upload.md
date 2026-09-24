# YouTube upload — HomeOps Guardian demo video

**File**: `docs/06-demo-submission/homeops-demo.mp4`, re-cut 2026-09-24 (140.37s = 2:20.4,
1920x1080 @ 30fps, AAC 48 kHz stereo, integrated -16.2 LUFS). 0:00-1:08 and the closing
card are the 2026-09-15 cut, unchanged; 1:08-2:14 is a new live recording of the Bedrock
agent and the MCP elicitation gate (`ops/video/recut-agent.mjs`).

40 seconds under the 3:00 hard limit.

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
1:08  A Bedrock Nova Pro agent plans; the MCP server asks the human (elicitation)
1:32  The model cannot approve its own plan; the final line comes from the server
1:55  What is real here, and what is modelled
2:14  Close

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

2. THE HUMAN GATE CANNOT BE PASSED BY THE MODEL. The stand-in for Alexa+ is a
Bedrock Nova Pro agent that can only call the tools the server lists. Staging a
load shift changes nothing. To confirm, the server itself asks the human through
MCP elicitation and shows the exact staged plan; it fails closed if the client
cannot ask. We checked it the hard way: making the server trust the model's own
"confirmed" flag instead of the human's answer makes 7 of 8 gate tests fail. The
agent's final line after a confirmation is written from the server's result, so
it can only say "Done" when the server reports executed actions.

3. NO FIGURE PRETENDS TO BE REAL. The server, the transport, the elicitation gate
and the Bedrock agent are real and tested: 57 server tests and 9 agent tests. The
household is not: no smart panel, no CT clamp, no meter, no utility feed. Every
payload carrying a number carries a dataSource block saying so, including an
instruction not to present the figures to anyone as their bill.

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

Uploaded 2026-09-24: https://youtu.be/00LRE46zk7U — Devpost both records verified.

Paste the watch URL back and it goes into:
1. The Devpost submission's video field
2. The P3 README, under the badges
3. `docs/06-demo-submission/walkthrough.md`, next to the local file reference
