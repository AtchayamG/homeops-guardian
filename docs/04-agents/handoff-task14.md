# Task 14 Handoff — Simulated Alexa+ Client Surface for HomeOps Guardian

> **Hackathon**: Amazon "Build, Ship, Shape" Developer Hackathon 2026  
> **Project**: Project 3 (`projects/03-alexa-mcp`)  
> **Track**: Alexa+ (Primary) | AWS Builder (Mini) | Open Source (Mini)  
> **Date**: 2026-09-14  
> **Worker**: Antigravity (`agy`)  

---

## 1. DONE

1. **Simulated Alexa+ Client Surface Web App (`apps/simulator`)**:
   - Built a single-page TypeScript web application on Vite (Node.js + browser-native ESM) adhering to current UI/UX principles, dark-first styling, and zero CSS frameworks.
   - Permanent disclosure banner mounted at the very top explaining that this is a simulated Alexa+ client surface per the track mandate (citing Amazon's developer relations build session at `https://youtu.be/ws61g53S2b4`, ~[07:38]–[09:22]), as no public SDK can drive an Echo Show today.
   - Conversational layout featuring user speech bubbles, Alexa+ responses with pulsating light-orb cues, interactive inline MCP tool cards, and a live Protocol & Network Inspector drawer.
   - Scripted walkthrough bar with 6 clickable suggested utterances exercising all tools in logical sequence.
   - Guaranteed honest failure state: with the server stopped, the UI halts conversation and displays an honest "MCP Server Offline" recovery card with the exact start command (`ops\run-mcp.cmd`).

2. **Genuine Model Context Protocol (Streamable HTTP `2025-11-25`) Integration**:
   - The simulator speaks real JSON-RPC 2.0 over Streamable HTTP (`POST http://127.0.0.1:3001/mcp`) with `Accept: application/json, text/event-stream` and receives genuine `MCP-Session-Id` headers.
   - Complete lifecycle: `initialize` handshake -> `tools/list` negotiation -> `tools/call` for 4 distinct server tools.
   - Zero hardcoded responses, zero canned transcripts, zero fake latencies.

3. **Demonstrable Human-Confirmation Gate**:
   - Rate-aware load-shifting stages physical electrical breaker commands behind an explicit human confirmation gate.
   - When `stage_load_shift` is invoked, the server returns status `PENDING_CONFIRMATION` with a unique action ID (e.g. `shift-bb58dba0`).
   - The UI renders an unmissable amber-glowing Confirmation Gate card itemizing circuit sheds (EV Charger pause 7.2 kW, Heat Pump HVAC eco-offset 2.4 kW, totaling 9.6 kW reduction and $42.50/mo savings).
   - Circuits demonstrably remain unmodified until the user clicks `[✓ Approve & Execute Load Shift]`, which issues a real `tools/call: confirm_load_shift` with `{ stagedActionId, confirmed: true }`.
   - Post-confirmation telemetry verified live from the server: household power drops from 13.4 kW to 3.8 kW, and hourly burn rate drops from $6.43/hr to $1.82/hr.

4. **Server Enhancements (`services/mcp-server`)**:
   - CORS middleware updated to support `OPTIONS` preflight on `/mcp`, allowing custom MCP headers and exposing `MCP-Session-Id` and `MCP-Protocol-Version` to browser clients.
   - Registered 3 domain tools alongside `ping`: `get_circuit_telemetry` (grounded in PG&E Schedule E-TOU-C $0.48/kWh peak tariff), `stage_load_shift`, and `confirm_load_shift`.
   - 14/14 automated unit and live HTTP integration tests passing green (`ops\test.cmd`).

5. **Evidence Automation Pipeline (`ops/capture-evidence.js`)**:
   - Automated Puppeteer-core script controlling headless Microsoft Edge on Windows.
   - Tested offline failure state, handshake, multi-tool conversation, confirmation gate appearance, approval execution, and protocol drawer inspection.
   - Captured 5 canonical screenshots with SHA-256 checksums and exported raw HTTP traffic logs to `ops/network-audit.json`.

---

## 2. BLOCKED

**NONE.** All acceptance criteria met and verified.

---

## 3. RISK

1. **Windows Child Process Teardown in Node**: When executing long-running dev/preview servers through child processes on Windows with `shell: true`, `child.kill()` terminates the wrapping `cmd.exe` shell but leaves child processes (`vite`, `node`) alive if stdout/stderr pipes stay attached. In `ops/capture-evidence.js`, we resolved this with defensive `try/catch` and explicit `process.exit(0)`. Developers running the preview server interactively should terminate via Ctrl+C in their console.
2. **CORS Origin Header Validation**: The MCP server strictly validates origins against `localhost` and `127.0.0.1` per DNS rebinding specifications. The Vite simulator must run on `http://127.0.0.1:5173` or `http://localhost:5173`. Accessing via an arbitrary IP address will be rejected with HTTP 403 Forbidden.

---

## 4. NEXT

1. **Audio Accessibility & Alexa Voice Synthesis**: Connect Web Speech API or AWS Polly in the simulator client for natural spoken voice output matching the Alexa+ persona.
2. **Additional Datasets**: Incorporate replayed traces from UK-DALE or REDD public smart-meter datasets for extended historical graph views.

---

## 5. FILES

### Created:
- `apps/simulator/package.json` — Simulator dependencies (Vite 6, TypeScript 5, puppeteer-core).
- `apps/simulator/tsconfig.json` — Browser TypeScript bundler configuration.
- `apps/simulator/vite.config.ts` — Vite preview and dev server setup bound to `127.0.0.1:5173`.
- `apps/simulator/index.html` — Simulator markup with disclosure banner, header orb, transcript, walkthrough chips, and inspector drawer.
- `apps/simulator/src/style.css` — Custom dark-first CSS with Alexa cyan accents, glowing orb, amber confirmation gate, and responsive cards.
- `apps/simulator/src/mcp-client.ts` — Native TypeScript MCP Streamable HTTP client with session lifecycle and network audit logging.
- `apps/simulator/src/main.ts` — Conversation dispatcher, tool renderer, confirmation gate controller, and audit log presenter.
- `ops/test.cmd` — Unified test script running both MCP server tests and simulator typecheck/build.
- `ops/run-simulator.cmd` — Script to launch the simulator locally.
- `ops/capture-evidence.js` — Automated headless Edge verification and screenshot capture script.
- `ops/network-audit.json` — Verbatim captured JSON-RPC payloads and HTTP response headers for all 7 network requests.
- `docs/assets/screenshots/01-server-offline.png` — Screenshot 1.
- `docs/assets/screenshots/02-handshake-connected.png` — Screenshot 2.
- `docs/assets/screenshots/03-conversation-tools.png` — Screenshot 3.
- `docs/assets/screenshots/04-confirmation-gate.png` — Screenshot 4.
- `docs/assets/screenshots/05-action-confirmed-telemetry.png` — Screenshot 5.

### Modified:
- `services/mcp-server/src/server.ts` — Added CORS exposed headers, OPTIONS preflight handler, and HomeOps Guardian tools (`get_circuit_telemetry`, `stage_load_shift`, `confirm_load_shift`).
- `services/mcp-server/tests/unit.test.ts` — Added tests for OPTIONS preflight, CORS headers, and all 4 tools.
- `services/mcp-server/tests/integration.test.ts` — Expanded live HTTP round-trip test to exercise all tools and confirmation execution.

---

## 6. SCREENSHOTS & SHA-256 EVIDENCE

All images are stored in `projects/03-alexa-mcp/docs/assets/screenshots/`.

| File | SHA-256 Checksum | What is Seen in the Image (Literal Description) |
|---|---|---|
| `01-server-offline.png` | `8c5a7d1afcac40c892af530746255d5d228f99ed8a7f2840a3d1c1b3519576fc` | Permanent cyan disclosure banner at the top. Top header shows a red status dot reading `Server Offline (127.0.0.1:3001)`. A large red-bordered card in the center displays a warning triangle with heading "MCP Server Offline", body text explaining that the simulator could not reach `http://127.0.0.1:3001/mcp`, instructions to start the server via `ops\run-mcp.cmd`, and a blue "Retry Connection" button. Below it sits the welcome card; no conversation messages are shown. On the right, the Protocol & Network Audit drawer shows `Session ID: None` and `Total Calls: 0`. |
| `02-handshake-connected.png` | `9304e17814fe7e732096b78b28b792a800c9b335c00a92cfe9ad9cf344d42687` | Disclosure banner visible. Top header now shows a glowing green status dot reading `Connected (Streamable HTTP)` with blue session badge `Session: a5a3f46f...`. The offline warning is gone. In the transcript area, the welcome card is visible with lightning icon. On the right, the Protocol & Network Audit drawer displays `Session ID: a5a3f46f-f56b-4766-b6ed-94b05f95cf93`, `Total Calls: 2`, and two audit entries: `POST http://127.0.0.1:3001/mcp (initialize)` with HTTP 200 (65ms) and `POST http://127.0.0.1:3001/mcp (tools/list)` with HTTP 200 (11ms) returning the 4 tools. |
| `03-conversation-tools.png` | `727d494232a5e122442a86bad380b212683a7575b20d2798abe9d00c118d9aa7` | A dark-themed conversation transcript. A dark-blue bubble on the right shows user utterance "Alexa, ping HomeOps Guardian". Below it, an inline card with cyan left-border shows `🔧 MCP Tool: ping`, session ID badge, and `6ms` latency badge, with expandable JSON result `{"status":"ok", "timestamp":"..."}`. Next is an Alexa response bubble with avatar orb explaining the server is online. Below that, user bubble "Alexa, what's my home energy status?", followed by inline tool card `🔧 MCP Tool: get_circuit_telemetry` (6ms) with raw circuit JSON. Below is Alexa's response detailing total draw of 13.4 kW ($6.43/hr burn rate under PG&E PEAK $0.48/kWh rate) and itemized bullet points for HVAC, EV Charger, and Water Heater. Right audit drawer shows `Total Calls: 4`. |
| `04-confirmation-gate.png` | `2f0fb91b37a1b7a122bd3fd694644ea964461349cabbb92cf5982e97f1360c19` | User bubble "Alexa, optimize high-draw appliances for peak rates". An inline tool card displays `tools/call: stage_load_shift` (9ms) returning JSON with `status: "PENDING_CONFIRMATION"`. Alexa bubble explains that shedding 9.6 kW saves $42.50/mo and requires confirmation. Directly underneath is a large **amber-glowing Human Confirmation Gate card** with heading `🔒 HUMAN CONFIRMATION REQUIRED` and `Action ID: shift-bb58dba0`. A breakdown table lists Tesla EV Wall Connector (`PAUSE CHARGING (Shed 7.2 kW)`), Heat Pump HVAC (`ECO SETPOINT +2°F (Shed 2.4 kW)`), Total Peak Load Shed `9.6 kW`, and Projected Monthly Savings `$42.50 USD` in bright green. Two action buttons are visible: orange `✓ Approve & Execute Load Shift` and gray `✕ Cancel / Maintain Current`. Right audit drawer shows `Total Calls: 5`. |
| `05-action-confirmed-telemetry.png` | `2d8a8beb01962696eec2d8b24325a1bc1bc768b651613d7f8a9fe1bc810acfe1` | Following user confirmation, user bubble shows "Alexa, check status after optimization". The inline tool card shows `get_circuit_telemetry` returning updated JSON from the live server: `ev_charger` is `PAUSED` (0 kW), `hvac_main` is `ECO` (1.4 kW), and `totalHomePowerKw` is `3.8 kW` (reduced from 13.4 kW), with burn rate `$1.82/hr` (reduced from $6.43/hr). Alexa speech bubble confirms: "Post-optimization telemetry verified from server: Total home draw is now 3.8 kW (down from 13.4 kW). Hourly burn rate has been lowered from $6.43/hr to $1.82/hr." Right drawer shows `Total Calls: 7`, with request/response entries for `confirm_load_shift` (HTTP 200, 9ms) and `get_circuit_telemetry` (HTTP 200, 6ms) with visible `MCP-Session-Id: a5a3f46f-f56b-4766-b6ed-94b05f95cf93`. |

---

## 7. VERBATIM NETWORK EVIDENCE (FROM `ops/network-audit.json`)

### 1. Handshake `initialize` (`POST /mcp`):
```http
POST http://127.0.0.1:3001/mcp HTTP/1.1
Accept: application/json, text/event-stream
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {
      "name": "alexa-plus-simulator",
      "version": "0.1.0"
    }
  }
}
```
**Response (HTTP 200, 65ms):**
```http
HTTP/1.1 200 OK
content-type: application/json
mcp-session-id: a5a3f46f-f56b-4766-b6ed-94b05f95cf93

{
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "homeops-guardian",
      "version": "0.1.0"
    }
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

### 2. Tool 1: `ping` (`POST /mcp`):
```http
POST http://127.0.0.1:3001/mcp HTTP/1.1
Accept: application/json, text/event-stream
Content-Type: application/json
MCP-Session-Id: a5a3f46f-f56b-4766-b6ed-94b05f95cf93
MCP-Protocol-Version: 2025-11-25

{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "ping",
    "arguments": {}
  }
}
```
**Response (HTTP 200, 6ms):**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"status\":\"ok\",\"timestamp\":\"2026-09-14T11:46:10.176Z\"}"
      }
    ]
  },
  "jsonrpc": "2.0",
  "id": 3
}
```

### 3. Tool 2: `get_circuit_telemetry` (`POST /mcp`):
```http
POST http://127.0.0.1:3001/mcp HTTP/1.1
Accept: application/json, text/event-stream
Content-Type: application/json
MCP-Session-Id: a5a3f46f-f56b-4766-b6ed-94b05f95cf93
MCP-Protocol-Version: 2025-11-25

{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "get_circuit_telemetry",
    "arguments": {}
  }
}
```
**Response (HTTP 200, 6ms):**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"timestamp\": \"2026-09-14T11:46:11.798Z\",\n  \"utility\": \"Pacific Gas & Electric (PG&E)\",\n  \"tariffSchedule\": \"E-TOU-C\",\n  \"currentTariff\": {\n    \"tier\": \"PEAK\",\n    \"ratePerKwh\": 0.48,\n    \"currency\": \"USD\",\n    \"window\": \"16:00 - 21:00 weekdays\"\n  },\n  \"circuits\": [\n    {\n      \"id\": \"hvac_main\",\n      \"name\": \"Heat Pump HVAC (Variable Speed)\",\n      \"status\": \"RUNNING\",\n      \"powerKw\": 3.8,\n      \"powerFactor\": 0.94,\n      \"hourlyCost\": 1.82\n    },\n    {\n      \"id\": \"ev_charger\",\n      \"name\": \"Level 2 EV Charger (Tesla Wall Connector)\",\n      \"status\": \"CHARGING\",\n      \"powerKw\": 7.2,\n      \"powerFactor\": 0.99,\n      \"hourlyCost\": 3.46\n    },\n    {\n      \"id\": \"water_heater\",\n      \"name\": \"Hybrid Heat Pump Water Heater\",\n      \"status\": \"HEATING\",\n      \"powerKw\": 2.4,\n      \"powerFactor\": 0.92,\n      \"hourlyCost\": 1.15\n    }\n  ],\n  \"totalHomePowerKw\": 13.4,\n  \"totalHourlyBurnRateUsd\": 6.43\n}"
      }
    ]
  },
  "jsonrpc": "2.0",
  "id": 4
}
```

### 4. Tool 3: `stage_load_shift` (`POST /mcp`):
```http
POST http://127.0.0.1:3001/mcp HTTP/1.1
Accept: application/json, text/event-stream
Content-Type: application/json
MCP-Session-Id: a5a3f46f-f56b-4766-b6ed-94b05f95cf93
MCP-Protocol-Version: 2025-11-25

{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "stage_load_shift",
    "arguments": {
      "reason": "User requested peak TOU rate optimization"
    }
  }
}
```
**Response (HTTP 200, 9ms):**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"stagedActionId\": \"shift-bb58dba0\",\n  \"status\": \"PENDING_CONFIRMATION\",\n  \"confirmationRequired\": true,\n  \"message\": \"Peak load-shift plan staged. Human confirmation required before modulating electrical circuits.\",\n  \"proposedActions\": [\n    {\n      \"circuitId\": \"ev_charger\",\n      \"action\": \"PAUSE_CHARGING\",\n      \"powerReductionKw\": 7.2,\n      \"details\": \"Pause charging during $0.48/kWh peak window; auto-resume at 21:00 off-peak ($0.34/kWh)\"\n    },\n    {\n      \"circuitId\": \"hvac_main\",\n      \"action\": \"ECO_SETPOINT_OFFSET\",\n      \"powerReductionKw\": 2.4,\n      \"details\": \"Apply +2°F thermal pre-cool offset to variable speed compressor\"\n    }\n  ],\n  \"projectedReductionKw\": 9.6,\n  \"estimatedMonthlySavingsUsd\": 42.5,\n  \"reason\": \"User requested peak TOU rate optimization\"\n}"
      }
    ]
  },
  "jsonrpc": "2.0",
  "id": 5
}
```

### 5. Tool 4: `confirm_load_shift` (`POST /mcp`):
```http
POST http://127.0.0.1:3001/mcp HTTP/1.1
Accept: application/json, text/event-stream
Content-Type: application/json
MCP-Session-Id: a5a3f46f-f56b-4766-b6ed-94b05f95cf93
MCP-Protocol-Version: 2025-11-25

{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "confirm_load_shift",
    "arguments": {
      "stagedActionId": "shift-bb58dba0",
      "confirmed": true
    }
  }
}
```
**Response (HTTP 200, 9ms):**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"stagedActionId\": \"shift-bb58dba0\",\n  \"status\": \"ACTION_EXECUTED\",\n  \"confirmedAt\": \"2026-09-14T11:46:17.211Z\",\n  \"newTotalHomePowerKw\": 3.8,\n  \"newHourlyBurnRateUsd\": 1.82,\n  \"message\": \"Load-shift executed successfully. High-draw circuits modulated.\"\n}"
      }
    ]
  },
  "jsonrpc": "2.0",
  "id": 6
}
```

---

## 8. RE-RUN VERIFICATION FOR ORCHESTRATOR

To verify the test suite:
```cmd
ops\test.cmd
```
Expected output:
```text
=== Testing HomeOps Guardian MCP Server ===
PASS tests/unit.test.ts
PASS tests/integration.test.ts
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total

=== Typechecking and Building Simulator Web App ===
✓ built in 115ms
=== ALL SUITES GREEN ===
```

To run the simulator:
```cmd
ops\run-mcp.cmd
ops\run-simulator.cmd
```
Navigate to `http://127.0.0.1:5173`.
