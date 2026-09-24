> **Re-cut 2026-09-24.** Everything below from segment 4 (1:08) onward describes the 2026-09-15 cut and is superseded: the keyword router and in-page Approve button it shows were replaced by a Bedrock Nova Pro agent and an MCP elicitation gate (P3-01/P3-02). The new 1:08-2:14 is a live recording made by `ops/video/recut-agent.mjs`; its narration text is in that script. 0:00-1:08 and the closing card are unchanged.

# Demo video script — HomeOps Guardian

> **Amazon Developer Hackathon 2026 (Build, Ship, Shape)**
> **Track**: Alexa+ (primary) · Open Source (mini) · **Entrant**: Atchayam G (solo)
> **Shipped cut**: `homeops-demo.mp4` — 163.000s (2:43.0), 1920x1080 @ 60fps,
> AAC 48 kHz stereo, mean −19.5 dB / peak −4.4 dB, no silence gap over 4s.

## Where the words actually live

The narration text is in [`ops/video/generate-tts.mjs`](../../ops/video/generate-tts.mjs)
and the timings in `ops/video/timeline.json`, both generated. This document is
the reasoning; it deliberately does not hold a second copy of the script, because
a prose copy drifts from the shipped audio the first time a line is trimmed — and
this project has already been bitten once by a document that described a state
the code had left behind.

The first pass ran **211.8s** of narration against a 180s hard limit. Two rounds
of trimming took it to **154.3s**, which with pacing became a 163.0s cut. What
was cut was explanation. What survived is the three things only this project can
say.

## Rules this script follows

1. **Third person.** The voice is Microsoft Edge Neural TTS (`en-US-AndrewNeural`),
   not the entrant, and it does not say "I am Atchayam". A submission whose
   subject is disclosure does not open by impersonating its author. The closing
   card states that the narration is synthesized.
2. **Every figure spoken is a figure the server sent during the take.** The
   protocol-floor card is verbatim stdout from `ops/probe-protocol-version.mjs`,
   captured at build time by `generate-cards.mjs`, so it cannot show a result the
   server did not just produce.
3. **No claim of an Echo device.** The one thing this track cannot do today is
   the first thing the video says.

## Running order, as shipped

| Segment | Start | Length | Screen |
| :--- | ---: | ---: | :--- |
| `vo-01` | 0:00.0 | 24.5s | Opening card |
| `vo-02` | 0:24.5 | 19.6s | Server offline → reconnect → real handshake, `ping` tool card, audit panel filling. Lower third: *A real transport* |
| `vo-03` | 0:44.1 | 24.3s | The protocol-floor probe, all six rows, captured live |
| `vo-04` | 1:08.4 | 32.1s | Telemetry, then `stage_load_shift` and the confirmation gate, with the raw payload visible above it. Lower third: *Nothing moves without a yes* |
| `vo-05` | 1:40.5 | 30.1s | Approval, the itemised `executedActions`, the reading afterwards, and a second plan proposing 0 kW. Lower third: *Promised vs delivered* |
| `vo-06` | 2:10.6 | 26.4s | The `dataSource` block expanded in a tool card. Lower third: *Real, and modelled* |
| `vo-07` | 2:36.1 | 7.2s | Closing card |

## What each segment is for

**1 — What this is, and what it cannot be.** The server's purpose in one
sentence, then the Alexa+ reality: the add-on console reads "Coming Soon"
(checked signed-in, 2026-09-14). Saying it first means nothing later has to be
hedged.

**2 — It is a real transport, and it says so when it is not.** The offline state
is recorded from a cold page, not staged by disconnecting afterwards. Then a
genuine handshake: session id, spec `2025-11-25`, every call visible in the
audit panel.

**3 — The protocol floor, which was false twice.** Measured, not asserted —
including the second failure, where two `ops/` scripts launched a compiled build
that predated the fix, so the probe reported the old behaviour while every test
stayed green. Friction-log entries 2 and 7.

**4 — Nothing moves without a yes.** The frame at 1:36 is the one that matters:
the raw `stage_load_shift` JSON and the gate card are on screen together, and
they agree line for line. Until this morning they could not have — the gate had
the plan typed into its HTML, and it looked right only because the hardcoded
numbers matched what the server sends.

**5 — Approve, and check the promise against the result.** Promised and
delivered are computed from opposite directions, so a disagreement would show.
The second plan proposing 0 kW is the behaviour a hardcoded plan could not
produce, and it is pinned by `tests/gate-invariants.test.ts`.

**6 — What is real and what is modelled.** 48 tests across 5 suites for the
server; no panel, no clamp, no meter, no feed for the household; and a
`dataSource` block on every payload carrying a number, including an instruction
not to present the figures as anyone's bill.

**7 — Close.**
