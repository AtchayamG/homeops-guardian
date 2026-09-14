# Walkthrough — HomeOps Guardian

> For a judge who will not run anything, and a judge who will.
> **Entrant**: Atchayam G · **Track**: Alexa+ (primary), Open Source (mini)

## The demo video

`homeops-demo.mp4` in this folder — 2:43, 1080p60, under the 3:00 limit. It is
the app in this repository driving the server in this repository: every figure
on screen arrived over MCP during the take, and the protocol-floor card is a
verbatim capture of `node ops/probe-protocol-version.mjs` run against the
server while the video was built.

The whole cut is reproducible, which is the point:

```cmd
ops\video\tts.cmd                  :: narration, and measure it
node ops\video\generate-cards.mjs  :: stills, incl. the live probe capture
ops\run-both-detached.cmd          :: both halves, from source
node ops\video\record.mjs          :: screencast, paced to the narration
node ops\video\assemble.mjs        :: cut and mix
ops\video\verify-video.cmd         :: duration, loudness, dead air, black frames
```

The recorder refuses to run if no server is up, and refuses to film a household
that has already been shifted — state lives in the server process, so a take
recorded after a verification run would show every proposed reduction at 0 kW.
The narration is synthesized (Microsoft Edge Neural TTS) and the closing card
says so.

---

## Read this first: why there is no public URL

The hackathon rules say judges are not required to test a submission. For this
track that is more than a convenience, because **there is nothing to deploy
to**. Alexa+ add-ons are not live — the portal's own "Create and manage your
add-on" console renders "Coming Soon" (checked 2026-09-14, signed in), and
Amazon's developer-relations team said the same on the official build session:
*"right now you cannot take an SDK and control an Echo Show."*

An MCP server is also, by design, something a client reaches locally or inside a
trust boundary. Publishing this one to the internet would demonstrate nothing
the protocol cares about and would put a household-control surface — however
simulated — on a public URL. So the deliverable is the server, the client that
speaks to it, and commands that reproduce every claim in under five minutes.

Everything below was run on Windows 11, Node.js v22.22.3.

---

## If you are not running it

Three claims carry this submission, and each has a file you can read instead of
a server you have to start.

| Claim | Where to check it without running anything |
| :--- | :--- |
| It is a real MCP Streamable HTTP server, not a mock | `services/mcp-server/src/server.ts` — POST/GET/DELETE on one `/mcp` endpoint, `MCP-Session-Id` issuance and validation, `Origin` checking, and the 406/400/404/403/204 paths. `tests/integration.test.ts` drives it over real HTTP with `fetch`. |
| Nothing moves without human confirmation | `stage_load_shift` returns a plan and touches no circuit; only `confirm_load_shift`, given that plan's own id and `confirmed: true`, changes state. Both in `src/server.ts`; proved by readings in `ops/verify-gate.mjs`. |
| No figure pretends to be real | Every `get_circuit_telemetry` payload carries a `dataSource` block — `liveRateFeed: false`, `liveMeter: false`, the modelling basis, a reference URL, and an instruction not to present the numbers as anyone's actual bill. A test fails if the tool description ever says "real-time" again. |

The [friction log](friction-log.md) and [product feedback](product-feedback.md)
are the other two documents worth your time; the friction log's entries each
name the command that reproduces them.

---

## If you are running it

### 1. Install and test (about a minute)

```bash
cd services/mcp-server
npm install
npm test
```

Expected, exactly:

```
PASS tests/ops-entrypoints.test.ts
PASS tests/unit.test.ts
PASS tests/integration.test.ts
Test Suites: 3 passed, 3 total
Tests:       32 passed, 32 total
```

Those 32 include the six negative transport paths, a six-case protocol-floor
matrix, and a suite that checks the `ops/` scripts themselves — see the note
below. If this is green, the transport is spec-shaped and the confirmation gate
holds.

> **Why a test reads the batch files.** `npm start` runs `tsx src/index.ts`, so
> a server started by hand is always the current source. Two `ops/` scripts
> used to start `node dist\index.js` instead, and `dist/` is a gitignored build
> artefact that is easy to leave stale. After the protocol floor was fixed in
> `src/server.ts` without a rebuild, the two entry points disagreed — the probe
> run against the detached script reported the *old* behaviour
> (`2024-11-05 → 2024-11-05`) while every test stayed green, because the tests
> import the source. A judge following step 5 below would have been talking to
> a server this repository no longer contains. Both scripts now run from
> source, and `tests/ops-entrypoints.test.ts` fails the build if any `ops/`
> script launches `node dist/` again. It found the second offending script by
> itself.

### 2. Start the server

```cmd
ops\run-mcp.cmd
```

Expected:

```
[HomeOps MCP Server] Running at http://127.0.0.1:3001/mcp
[HomeOps MCP Server] Health probe at http://127.0.0.1:3001/health
[HomeOps MCP Server] Protocol version: 2025-11-25
```

### 3. Prove the protocol floor (the check a README cannot pass for you)

```bash
node ops/probe-protocol-version.mjs
```

Expected — note that **every** row answers with the floor, including clients
asking for older versions:

```
client asks for 2025-11-25 (the hackathon minimum)   200  2025-11-25
client asks for 2025-06-18                           200  2025-11-25
client asks for 2025-03-26 (the SDK default)         200  2025-11-25
client asks for 2024-11-05                           200  2025-11-25
client omits protocolVersion entirely                400  error -32000
client asks for a version that does not exist        200  2025-11-25
```

Before we fixed this, rows two to four answered with the version the client
asked for — so the server would have spoken `2024-11-05` while the README
claimed `2025-11-25`. Friction-log entry 2 has the before-and-after table and
why the SDK makes this easy to get wrong.

### 4. Prove the confirmation gate by readings, not screenshots

```bash
node ops/verify-gate.mjs
```

This drives the live server over MCP and checks three things a screenshot could
not:

- after `stage_load_shift`, **every circuit is untouched** — 13.4 kW total,
  `ev_charger` still `CHARGING`
- after `confirm_load_shift` with `confirmed: true`, they move — 3.8 kW total,
  `ev_charger` `PAUSED`
- the **9.6 kW the plan promised equals the 9.60 kW delivered**

That last check is the one nothing in the UI would have caught: a gate that
executes something other than what it described is worse than no gate.

### 5. See the interaction (the part the track is judged on)

```cmd
ops\run-both-detached.cmd
```

Then open **http://127.0.0.1:5173**. The simulator is a stand-in for Alexa+, not
a mock of the server: it performs a real `initialize` handshake, a real
`tools/list`, and real `tools/call` requests over Streamable HTTP with the
session header. Nothing between the two halves is faked.

What to watch, in order:

1. **Server offline** — the client says so plainly instead of rendering an empty
   conversation.
2. **Handshake** — session id issued, protocol version `2025-11-25` agreed.
3. **Tools discovered** — all four, with the descriptions a model would read.
   `get_circuit_telemetry` says SIMULATED, deliberately.
4. **Telemetry returned** — with the `dataSource` provenance block visible, and
   the tariff line reading *"a modelled PG&E PEAK tier ($0.48/kWh —
   illustrative, not a live rate)"*.
5. **A plan is staged** — `PENDING_CONFIRMATION`, `confirmationRequired: true`,
   and the circuits do not move.
6. **You approve it** — and only now does anything change.

Try step 5 and then close the tab without approving. Nothing happened. That is
the whole point.

---

## What is real and what is simulated

| | |
| :--- | :--- |
| **Real** | The MCP server, the Streamable HTTP transport and its session handling, the JSON-RPC handshake, the tool schemas, the confirmation gate's logic and state transitions, and the client's HTTP conversation with the server. |
| **Simulated** | The household. Circuits, power draws, power factors, hourly costs and the time-of-use tariff are modelled in software. There is no smart panel, no CT clamp, no meter, and no utility feed. Every payload says so in its own `dataSource` block. |
| **Not possible for anyone yet** | Deploying to an Echo device. See the top of this document. |

We shipped a version of this where the tariff did not say so, and it read as a
live rate quote from a named utility. Finding and fixing that is written up in
the README and in friction-log entry 5, because it is the most useful thing we
learned building this.
