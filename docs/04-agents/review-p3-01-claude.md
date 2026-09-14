# Orchestrator Review P3-01 — agy Task P3-1 (2026-09-03, 13:00 IST) — **APPROVED**

## Verified independently (not taken from the handoff)
The orchestrator started the server itself and issued real HTTP requests (`ops/verify-live.cmd`):
- `GET /health` → `{"status":"ok","service":"homeops-guardian-mcp","activeSessions":0,...}`
- `POST /mcp` initialize → `{"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"homeops-guardian","version":"0.1.0"}},"jsonrpc":"2.0","id":1}`
- Response carried a real `mcp-session-id: 57e59cf6-…` header → session management is implemented, not faked.
- **Negative test written by the orchestrator**: POST without the `Accept: application/json, text/event-stream` header → **HTTP 406**, which is the spec-correct rejection. agy did not know this test was coming.
- Source review: `POST` / `GET` (SSE) / `DELETE` on `/mcp`, session validation, origin validation. Grep for `mock|fake|stub|TODO|hardcode` in server source → **zero hits**.
- Spec notes carry citation URLs; product brief gives 3 candidates, a scoring matrix, a recommendation and an honest "what would lose points" section.

Verdict: genuine, working, spec-compliant foundation. Fourth clean pass in a row.

## Orchestrator's own opinion on the concept (differs from agy's)
agy recommends **HomeOps Guardian** (home energy + appliance health) and scores it 90/100. The engineering case is sound, but it under-weights one structural problem:

**Every input is synthetic.** The entire product rests on simulated appliance telemetry. Compare with NarraTV, whose inputs are *real*: real CC-BY films, real subtitle tracks, real timing. That contrast is exactly what made NarraTV credible once it worked. A judge looking at HomeOps sees analytics over numbers we invented — and "physics-based simulator" is still invented. It also sits in tension with the truthfulness standard this portfolio has enforced all night.

**Fix that makes the concept strong rather than replacing it:** ground it in real, publicly available data.
- Use **real published utility time-of-use tariffs** (a named utility's published rate card, cited) instead of invented pricing tiers.
- Drive the telemetry from a **real public appliance-level energy dataset** (e.g. UK-DALE / REDD-class household electricity datasets, or any openly licensed smart-meter dataset) rather than generated waveforms — replayed as a live stream.
- Keep the simulator only for *what-if* projections, clearly labelled, in the same way DEMO_MODE is labelled in NarraTV.

That converts the weakest point ("all data is made up") into a strength ("real measured household data + real published tariffs, with an honest simulation layer for projections"), at little extra cost. **Any dataset used must be verified for licence and cited — the orchestrator will re-fetch every source URL.**

## Priority note
Project 1 (Fire TV, $25k track) remains the priority the moment AWS activates. Project 3 is filling dead time only.
