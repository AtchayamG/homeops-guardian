# Task 14 — Simulated Alexa+ client surface for HomeOps Guardian

## Role and workspace
You are Antigravity ("agy"), the implementation worker on this hackathon portfolio.
Workspace root: `D:\Work\Codex\Hackathon Projects\Amazon Developer Hackathon`
Project: `projects\03-alexa-mcp`
New code goes in: `projects\03-alexa-mcp\apps\simulator`

## Read first, in full
1. `projects\03-alexa-mcp\README.md` — especially the Verified vs Unverified table. Note the
   corrected "Live Alexa+ On-Device Deployment" row: nobody can deploy to an Echo yet, the
   track is judged on plain-spec MCP plus the interaction proposed, and the hosts explicitly
   endorsed a simulated client. That is the mandate for this task.
2. `projects\03-alexa-mcp\services\mcp-server\src\server.ts` and `src\index.ts` — the real
   server you will talk to. Do not modify it except as Section "Server changes" allows.
3. `projects\03-alexa-mcp\services\mcp-server\tests\integration.test.ts` — shows the exact
   handshake the server expects.
4. `HACKATHON-RULES-AND-RESOURCES.md` at the workspace root — judging criteria and the
   "What the hosts said scoring actually turns on" section.
5. `projects\01-firetv-narratv\AGENTS.md` — rule 0, anti-fabrication, applies here too.

## Why this exists
The Alexa+ prize is an ideation prize this year. The server is real and tested; what is
missing is a way for a judge to *see* the conversation it enables. Amazon's own internal
hackathon teams demoed this as a web mockup of the Alexa+ back-and-forth, and the hosts said
on the record that this is what they are looking for.

## Deliverable
A single-page web client at `projects\03-alexa-mcp\apps\simulator` that:

1. **Talks to the real server over real MCP.** Streamable HTTP, `POST /mcp`, a genuine
   `initialize` → `tools/list` → `tools/call` sequence with a real `MCP-Session-Id`. No
   canned JSON, no fake latency, no hard-coded responses. If the server is not running, the
   UI must say so plainly rather than showing a rehearsed transcript.
2. **Looks like an Alexa+ interaction, not a REST console.** A conversation transcript:
   the person speaks, Alexa+ replies, and when a tool call happens it is shown inline as a
   visible step with the tool name, arguments and result. A judge should be able to read the
   screen and understand both the experience and the protocol underneath it.
3. **Shows the human-confirmation gate.** The server stages rate-aware load-shifting behind
   an explicit confirmation. That gate is the most interesting thing in this project — an
   agent that asks before it acts on your home's electrical circuits. Make the confirmation
   step impossible to miss, and show clearly that nothing is actioned until the person says
   yes.
4. **Has a scripted walkthrough** the judge can click through — a row of 4–6 suggested
   utterances that exercise the real tools in a sensible order, so nobody has to guess what
   to type.
5. **Declares what it is.** A visible, permanent banner: this is a simulated Alexa+ client,
   not an Echo device, because no SDK can drive an Echo today. Link the build-session
   timestamp cited in the README. Never imply a real device is involved.

## Stack constraints
- Plain TypeScript, Vite, no UI framework heavier than React if you use one at all.
- No CSS framework. Hand-written CSS. It must not look like a generic AI-generated admin
  template — the standing directive on UI/UX applies: current design principles, distinctive,
  legible, dark-first to match the Alexa+ aesthetic.
- Must run with one documented command and must degrade honestly with the server down.

## Server changes
Allowed only if strictly required for a browser client: CORS headers on `POST /mcp`, and an
`OPTIONS` preflight. Anything else, report in NEXT rather than doing it. Every server change
needs a test.

## The four hard rules (verbatim)
(a) Never invent media, data, sources, licences or test results. Reporting BLOCKED with the
exact error is acceptable; fabrication ends the task.
(b) Never replace a failing real component with a simulation. Mocks live in tests only.
**Note the distinction here:** simulating the *Alexa+ client* is the deliverable and is
sanctioned. Simulating the *MCP server* or its responses is fabrication and ends the task.
(c) Build and test only via the `ops\` scripts; add one if none fits. Never create anything
outside the workspace folder.
(d) No commit, no push, no deploy. No Devpost or YouTube actions. No AWS console actions.

## Acceptance criteria the orchestrator will re-run
- `ops\test.cmd` (or the script you add) green, including any new server tests.
- The simulator loads, completes a real handshake, and calls at least three distinct tools.
- Network evidence: a captured request/response pair per tool call proving it went over HTTP
  to the real server, with the session id visible.
- With the server stopped, the UI shows an honest failure state and no transcript.
- The confirmation gate blocks the action until accepted, demonstrably.

## Required handoff
`projects\03-alexa-mcp\docs\04-agents\handoff-task14.md` with **DONE**, **BLOCKED** (exact
error text), **RISK**, **NEXT**, **FILES**, and **SCREENSHOTS** — SHA-256 of each image plus,
in plain words, what you actually SEE in it. Not what it should show. What it shows.

The orchestrator will run the server, open the simulator, watch the network traffic, stop the
server to check the failure state, and open every screenshot you cite.
