# HomeOps Guardian — Alexa+ MCP Server

> **Amazon Developer Hackathon 2026** ("Build, Ship, Shape")  
> **Track**: Alexa+ (Primary) | AWS Builder (Mini) | Open Source (Mini)  
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
| **Live Alexa+ On-Device Deployment** | **NOT POSSIBLE FOR ANYONE YET** | Alexa add-ons are not live, and there is no SDK that can drive an Echo device today — confirmed by Amazon's developer-relations team on the hackathon's official build session (https://youtu.be/ws61g53S2b4, ~[07:38]–[09:22] and ~[59:33]–[60:56]): *"right now you cannot take an SDK and control an Echo Show."* The Alexa+ track is therefore judged on a server built to the **plain MCP standard** plus the interaction it proposes, and the hosts explicitly endorsed demonstrating it through a simulated client — that is what their own internal teams built. The US-only MCP Toolkit restriction is real but is **not a scoring penalty**: Alexa+ is rolling out country by country and no entrant anywhere can currently deploy to a device. This row exists to be precise about what was and was not exercised, not to flag a gap in this submission. |
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
The server will start listening at:
`http://127.0.0.1:3001/mcp`

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

- **Transport**: MCP Streamable HTTP (`2025-11-25`), mounted at single endpoint `/mcp`.
- **Headers**:
  - `Accept: application/json, text/event-stream`
  - `MCP-Session-Id: <uuid>` (session isolation)
  - `MCP-Protocol-Version: 2025-11-25`
- **Initial Tool**: `ping` — returns `{ status: "ok", timestamp: ISO8601 }`.
