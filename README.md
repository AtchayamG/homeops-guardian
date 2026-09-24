# HomeOps Guardian — Alexa+ MCP Server


**▶ [Watch the 2:20 demo](https://youtu.be/00LRE46zk7U)** — a real MCP handshake, the protocol floor measured live, and the confirmation gate rendering the plan the server actually staged.

> **Amazon Developer Hackathon 2026** ("Build, Ship, Shape")  
> **Track**: Alexa+ (Primary) | AWS Builder (Mini) | Open Source (Mini)  
> *AWS Builder: Amazon Bedrock is called at runtime. The agent that stands in for Alexa+ is a Bedrock
> Converse tool-use loop on `amazon.nova-pro-v1:0` (`services/agent`). Entered for that mini on 2026-09-24,
> after the Bedrock agent replaced the keyword router.*  
> **Entrant**: Atchayam G (Solo Entrant)  
> **License**: MIT  

HomeOps Guardian is an agentic household resource and appliance health orchestration server implementing the **Model Context Protocol (MCP) Streamable HTTP** transport (spec version `2025-11-25`). It exposes diagnostic and telemetry tools allowing Alexa+ to query domestic electrical circuits, detect appliance duty-cycle anomalies, correlate energy consumption with dynamic time-of-use (TOU) utility rates, and stage rate-aware load-shifting with explicit human confirmation gates.

---

## 1. Verified vs. Unverified Status

In accordance with the truthfulness standards of this portfolio:

| Component | Status | Verification Evidence |
|---|---|---|
| **MCP Streamable HTTP Server** | **VERIFIED** | Real TypeScript server running on Node.js v22; passes automated unit test suite and integration test with real HTTP round-trip (`POST /mcp`). |
| **JSON-RPC Handshake & Tool Calling** | **VERIFIED** | `initialize`, `tools/list`, and `tools/call` for `ping` tool execute against live HTTP transport returning real timestamps. |
| **Streamable HTTP Session Handling** | **VERIFIED** | Handles `MCP-Session-Id` issuance, validation, and rejection of missing session headers on non-init requests per spec. |
| **Protocol floor of `2025-11-25`** | **VERIFIED (measured, and it used to be false twice)** | A client asking for `2024-11-05` was answered `200 / 2024-11-05` before the fix; it is now answered `200 / 2025-11-25`. Both states reproducible with `node ops/probe-protocol-version.mjs`; six tests pin it. It then came back a second way: two `ops/` scripts launched `node dist\index.js`, and `dist/` was a stale build without the fix — so the server a judge would have started was pre-fix while every test stayed green. Both scripts now run from source and `tests/ops-entrypoints.test.ts` fails the build if that returns. Friction-log entry 7. |
| **Human confirmation gate** | **VERIFIED locally** | `node ops/verify-gate.mjs`: the server sends `elicitation/create` to a client that declared form elicitation. Decline and missing capability leave 13.4 kW unchanged; an accepted `approve:true` yields 3.8 kW, with promised and delivered reductions both 9.6 kW. The agent forwards elicitation to the UI and cannot answer it through a tool argument. MCP does not cryptographically attest that an arbitrary third-party client used a human. |
| **Bedrock agent planner** | **VERIFIED locally, not yet published** | `services/agent` uses Nova Pro through Bedrock Converse in `us-east-1`, with tools derived from MCP `tools/list`. Real runs on 2026-09-23 called telemetry, stage, then confirm and reached the server's human elicitation; the probe declined and no circuit changed. Request IDs and outputs are in the private P3-01 handoff. |
| **Simulator agent trace** | **VERIFIED locally** | The browser showed the Bedrock mode, tool arguments/results, a server-authored elicitation card, and an MCP JSON-RPC inspector. After Decline, the confirm result reported `ACTION_CANCELLED`, delivered reduction 0, and 13.4 kW. |
| **Tariff and telemetry figures** | **SIMULATED, AND SAID SO IN THE PAYLOAD** | Every `get_circuit_telemetry` result carries a `dataSource` block (`liveRateFeed: false`, `liveMeter: false`, modelling basis, reference URL). The tool description says SIMULATED; a test fails if it ever says "real-time" again. |
| **Live Alexa+ On-Device Deployment** | **NOT POSSIBLE FOR ANYONE YET** | Checked first-hand on 2026-09-14 from a registered Amazon developer account: the portal's own **"Alexa+ Developer Console — Create and manage your add-on"** link resolves to `https://developer.amazon.com/alexa/console/ask/addons#/`, and that page renders **"Coming Soon"**. Add-ons are not live, and there is no SDK that can drive an Echo device today — confirmed by Amazon's developer-relations team on the hackathon's official build session (https://youtu.be/ws61g53S2b4, ~[07:38]–[09:22] and ~[59:33]–[60:56]): *"right now you cannot take an SDK and control an Echo Show."* The Alexa+ track is therefore judged on a server built to the **plain MCP standard** plus the interaction it proposes, and the hosts explicitly endorsed demonstrating it through a simulated client — that is what their own internal teams built. The US-only MCP Toolkit restriction is real but is **not a scoring penalty**: Alexa+ is rolling out country by country and no entrant anywhere can currently deploy to a device. This row exists to be precise about what was and was not exercised, not to flag a gap in this submission. |
| **Appliance Telemetry Hardware (Smart Panels / CT Clamps)** | **UNVERIFIED / SIMULATED** | Hardware-in-the-loop CT clamps and physical smart meters are simulated in software; no physical electrical panel is connected. |

---

## 2. Quickstart & How to Run

### Prerequisites
- Windows 11 / macOS / Linux
- Node.js 20+ (tested on Node.js v22.22.3)
- npm or yarn

### Installation
```bash
cd services/mcp-server
npm install
cd ../agent
npm install
cd ../../apps/simulator
npm install
```

### Running the Server
Using the ops batch script:
```cmd
ops\run-mcp.cmd
```
Or directly using npm:
```bash
cd services/mcp-server
npm start
```
The MCP server will start listening at:
`http://127.0.0.1:3001/mcp`

Run `npm start` in `services/agent` (port 3003), then `npm run dev` in
`apps/simulator` (port 5173). `ops\run-both-detached.cmd` starts all three
local services from source. Bedrock uses the default AWS credential chain;
if unavailable, the UI explicitly labels its keyword path
`Scripted fallback - no model`.

### Running the Tests
Using the ops batch script (which generates `ops/test-run.log`):
```cmd
ops\test-mcp.cmd
```
Or directly using npm:
```bash
cd services/mcp-server
npm test
```

---

## 3. Architecture & Spec Alignment

- **Transport**: MCP Streamable HTTP (`2025-11-25`), mounted at the single endpoint `/mcp`.
- **Methods**: `POST` (JSON-RPC), `GET` (SSE stream), `DELETE` (session termination), `OPTIONS` (preflight).
- **Headers**:
  - `Accept: application/json, text/event-stream`
  - `MCP-Session-Id: <uuid>` (issued on `initialize`, required on every later request)
  - `MCP-Protocol-Version: 2025-11-25`
- **Negative paths, each with a test**: `406` when `Accept` is missing either media type (POST) or `text/event-stream` (GET) · `400` when a non-initialize request carries no session id · `404` on an unknown session id · `403` on a disallowed `Origin` (the spec's DNS-rebinding guard) · `204` on `DELETE`.

### The protocol floor

The Alexa+ track states a **minimum** spec version of `2025-11-25`, and
`@modelcontextprotocol/sdk` 1.30.0 will negotiate down to `2024-10-07` if a
client asks — its own `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` is `2025-03-26`,
below the stated minimum. Measured before we fixed it, a client asking for
`2024-11-05` got `200` and a handshake agreeing to `2024-11-05`. So "implements
2025-11-25" would have been true only of the best case.

`PROTOCOL_FLOOR` in `services/mcp-server/src/server.ts` now holds the line: an
`initialize` naming anything lower is answered with the floor, which is the
spec's own remedy — the server replies with a version it will serve and the
client decides. Reproduce both states with `node ops/probe-protocol-version.mjs`
against a running server; six tests in `tests/integration.test.ts` pin it.

### Tools

| Tool | What it does | Notes |
| :--- | :--- | :--- |
| `ping` | Health check; returns `{ status, timestamp }` | Used by the simulator to prove the transport before anything else. |
| `get_circuit_telemetry` | Per-circuit power draw, power factor and hourly cost, plus the modelled TOU tariff | Every payload carries a `dataSource` provenance block: simulated household, `liveRateFeed: false`, `liveMeter: false`, the tariff stated as modelling a published residential TOU structure rather than being warranted current. See the note below. |
| `stage_load_shift` | Proposes a rate-aware load shift and returns it as **staged**, changing nothing | Returns `status: PENDING_CONFIRMATION` and `confirmationRequired: true`. |
| `confirm_load_shift` | The human confirmation gate — executes or cancels a staged action | `confirmed:false` cancels. `confirmed:true` triggers server-authored MCP form elicitation; only `accept` plus `approve:true` executes. Without the client capability, the tool returns `HUMAN_CONFIRMATION_UNAVAILABLE`. |

### Why the confirmation gate is the point

An agent that can turn off your EV charger should not be able to do it because
a sentence was ambiguous. `stage_load_shift` deliberately cannot act: it
returns a plan. Only `confirm_load_shift`, with the staged action's own id, a
request for confirmation, and a separate accepted MCP elicitation with
`approve:true`, moves a single watt. A model cannot approve through a tool
argument in the shipped agent. An arbitrary external MCP client can implement
its own elicitation handler, so this local protocol gate is not proof of human
identity.

`ops/verify-gate.mjs` proves this with readings rather than screenshots:
staging leaves every circuit untouched (13.4 kW total, `ev_charger` CHARGING),
approval moves them (3.8 kW, `ev_charger` PAUSED), and the 9.6 kW the plan
promised is the 9.60 kW it delivered. That last check is the one nothing in the
UI would have caught.

### A figure that cannot say where it came from does not get to sound authoritative

`get_circuit_telemetry` used to describe itself as *"Query **real-time**
electrical circuit power telemetry and current utility TOU tariff rate"*, and
returned Pacific Gas & Electric, Schedule E-TOU-C and $0.48/kWh beside a live
ISO timestamp. Every one of those figures is a fixture. Read together they are
a rate quote apparently pulled from a named utility seconds ago — and the
client here is Alexa+, which would speak it to someone as their electricity
bill.

The tool description is the only thing a model has for deciding how much
authority to grant an answer, so a description claiming real-time data is the
first link in that chain. Provenance now travels with the data, the
description says SIMULATED, and two tests fail if either regresses: one
asserting the `dataSource` block survives, one reading `tools/list` and failing
if the description ever says "real-time" again.

We found this in our own code, unprompted. What it cost, and five other things
the platform made harder than it needed to be, are in the
[friction log](docs/06-demo-submission/friction-log.md). Feedback for every
tool and SDK used is in [product feedback](docs/06-demo-submission/product-feedback.md).

---

## 4. Submission documents

| Document | Contents |
| :--- | :--- |
| [`docs/06-demo-submission/walkthrough.md`](docs/06-demo-submission/walkthrough.md) | Exact commands, expected output, and what a judge should see at each step |
| [`docs/06-demo-submission/friction-log.md`](docs/06-demo-submission/friction-log.md) | Six reproducible friction entries with severity, workaround and suggested fix |
| [`docs/06-demo-submission/product-feedback.md`](docs/06-demo-submission/product-feedback.md) | Per-tool feedback, prioritised feature requests, would-build-again |
| [`docs/02-product/product-brief.md`](docs/02-product/product-brief.md) | The problem this is meant to solve |
| [`docs/00-research/mcp-spec-notes.md`](docs/00-research/mcp-spec-notes.md) | Spec reading notes taken while building the transport |
