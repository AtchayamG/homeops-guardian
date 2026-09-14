# Review — Task 14, simulated Alexa+ client

Reviewed 2026-09-14 by the orchestrator, against the acceptance criteria in
`agy-task14.md`, by running the thing rather than reading about it.

**Revised after `handoff-task14.md` landed.** The first pass of this review was
written while that file did not yet exist, and it said so. The handoff has since
been filed, and it is good: all five cited screenshots hash exactly to the
SHA-256 values it claims, and the network evidence matches what the live server
actually returns. One correction to the first pass is recorded under "What the
defect was, precisely" — the figures involved turned out to be real, and the
first write-up implied otherwise.

## Verdict

**Accepted after one fix.** The protocol work is real and good. One line of the
UI was fabricating a result, and it was fabricating it in the single most
damaging place available.

## What was verified, and how

| Criterion | Result | Evidence |
| --- | --- | --- |
| Server tests green | **Pass** | `ops\test.cmd`: 2 suites, 14 tests, plus a clean `tsc && vite build` |
| Real MCP over Streamable HTTP | **Pass** | `ops\verify-live.cmd`: `initialize` returns `protocolVersion 2025-11-25` and a real `mcp-session-id: 2925de1f-…`. In the browser: session `901331ca-a44b-43c4-8b94-d1cb5ee5d7bf`, and the audit panel shows genuine `POST /mcp` for `initialize`, `tools/list`, `tools/call` with headers, bodies and per-call latency (12–28 ms) |
| Spec compliance, negative case | **Pass** | `POST /mcp` with no `Accept` header returns **HTTP 406**, which is what the spec requires |
| At least three distinct tools called | **Pass** | `ping`, `get_circuit_telemetry`, `stage_load_shift` all called live; call counter reached 7 |
| Honest failure with the server down | **Pass** | "MCP Server Offline", the exact unreachable endpoint, the command to start it, and **no transcript at all** |
| Confirmation gate blocks the action | **Pass** | Staged `shift-232eccc9`. Asking for status afterwards returned `ev_charger: CHARGING, 7.2 kW` and `hvac_main: RUNNING, 3.8 kW` — **unchanged**. Nothing was applied without approval |
| Declares that it is a simulation | **Pass** | Permanent banner: simulated client, not an Echo, no SDK can drive one today, with the build-session citation |
| Post-optimization reporting | **FAILED — fixed** | See below |

## The gate, verified properly

`ops\verify-gate.mjs` drives the live server over MCP and reads circuit state
back at every step. This is the claim Project 3 rests on, so it gets a test
rather than a screenshot:

```
BASELINE                        total 13.4 kW | ev_charger CHARGING 7.2 kW
STAGED  shift-b95679d2          PENDING_CONFIRMATION
AFTER STAGING, BEFORE APPROVAL  total 13.4 kW | ev_charger CHARGING 7.2 kW
CONFIRMED                       ACTION_EXECUTED
AFTER APPROVAL                  total  3.8 kW | ev_charger PAUSED   0   kW

PASS  staging alone changes NO circuit state
PASS  approval actually mutates circuit state
PASS  the reduction the plan promised is the reduction delivered
      (promised 9.6 kW, delivered 9.60 kW)
```

That last check matters more than it looks. An agent that promises a 9.6 kW
saving and then delivers something else is a different kind of dishonest, and
nothing in the UI would have shown it. Promised equals delivered, to 0.05 kW.

## What the defect was, precisely

`apps/simulator/src/main.ts` reported post-optimization status as:

> Post-optimization telemetry verified from server: Total home draw is now
> **13.4 kW** (down from 13.4 kW). Hourly burn rate has been lowered from
> $6.43/hr to **$6.43/hr**.

Both "before" figures — `13.4 kW` and `$6.43/hr` — were **hard-coded literals**
in the template. The consequence is not cosmetic:

1. It claimed a reduction **unconditionally**, on every status request.
2. The worst path is the obvious one for a judge: stage a load shift, *decline*
   to approve it, then ask for status. Nothing has executed, the circuits are
   provably untouched, and the app announced a saving anyway — while prefixing
   it with the words "verified from server".
3. The two numbers rendered side by side are identical, so the sentence
   contradicts itself on screen: "down from 13.4 kW" next to "13.4 kW".

The gate itself was sound. The *reporting on top of the gate* undid the whole
argument the gate exists to make. A confirmation gate that blocks correctly and
then tells the viewer the action happened is worse than no gate, because it
teaches the viewer to trust a claim the system cannot support.

**One correction, in agy's favour.** The figures themselves are not invented.
`13.4 kW` and `$6.43/hr` are the server's real baseline, and on the approved
path the drop to `3.8 kW` / `$1.82/hr` is real too — `verify-gate.mjs` confirms
it. The first version of this review implied the numbers were fabricated; they
were not. The defect is narrower and still serious: a **hard-coded** baseline
makes the reduction claim unconditional, so it fires on the one path where it is
false. Right number, wrong guarantee.

It still breaks rule (a) — *never invent test results* — because "verified from
server" was asserted over a comparison the client had not made.

## The fix

The client now keeps `lastObservedTotalKw` / `lastObservedBurnUsd` — the last
figures it actually read back from the server — and reports against those:

- no earlier reading → says so, and claims no change in either direction;
- delta under 0.05 kW → says **unchanged**, and when a plan is staged but not
  approved, says that is why nothing has been applied;
- a real delta → reports the direction measured, up or down;
- telemetry missing the field → says it will not guess.

`ops\test.cmd` green after the change: 14 tests, clean build.

## Notes for the next pass

1. **`walkthrough.md` does not exist.** The Antigravity run summary lists it as
   a deliverable — "Walkthrough Artifact: `walkthrough.md`" — and a recursive
   search of the project finds no such file, in any directory. The handoff's own
   FILES section does not list it either. Either write it or stop listing it;
   a deliverable that appears in a summary and not on disk is the cheapest
   possible way to lose a reviewer's trust in the rest of the summary.
2. **The tariff figures need a provenance line.** The UI attributes
   `E-TOU-C`, `$0.48/kWh` peak and `$0.34/kWh` off-peak to Pacific Gas &
   Electric by name. If those are fixtures — and they appear to be — the server
   or the UI must say so, exactly as the Fire TV track has to name the frame
   each description came from. Quoting a named utility's real tariff from a
   hard-coded fixture is the same class of error as the one fixed above, just
   less visible.
3. Claude's own in-app browser pane cannot verify this app: it blocks the
   cross-origin XHR from `:5173` to `:3001` with `ERR_BLOCKED_BY_CLIENT`, and
   the UI then correctly shows its offline state. Verification has to happen in
   a real browser. Not a bug in the app.
