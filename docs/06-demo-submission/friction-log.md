# Friction Log — HomeOps Guardian (Alexa+ / MCP)

> **Amazon Developer Hackathon (Build, Ship, Shape 2026)**
> **Project**: HomeOps Guardian — Alexa+ track (primary), AWS Builder and Open Source minis
> **Bonus category**: Tool & SDK friction log (assessed at Stage 1, up to +10%)
> **Author**: Atchayam G (solo entrant)
> **Environment**: Windows 11, Node.js v22.22.3, `@modelcontextprotocol/sdk` 1.30.0, MCP Streamable HTTP spec `2025-11-25`

Every entry below is something that actually cost time on this project. Each one
names the command or file that reproduces it. Nothing here is padding, and where
the fix was mine rather than the platform's, it says so.

---

### Entry 1: Nothing in the Alexa+ documentation says add-ons are not live yet

* **Task attempted**: Work out what "build an Alexa+ add-on" concretely means — what gets deployed, to what, and how it is tested against a real Echo device.
* **Steps taken**: Read the Alexa+ track brief, the Agent Skills page (`apps.extensions.modelcontextprotocol.io/api/#build-with-agent-skills`), and the MCP Streamable HTTP spec page linked from the hackathon's resources tab. Searched for a deployment path, a device pairing step, or a sandbox. Then, with a registered Amazon developer account, opened the console link itself: the portal's home page offers **"Alexa+ Developer Console — Create and manage your add-on"**, which resolves to `https://developer.amazon.com/alexa/console/ask/addons#/`. That page renders two words: **"Coming Soon"**. Verified 2026-09-14 while signed in.
* **Expected vs actual**: Expected the track's own pages to state availability, as an SDK page normally does. Instead the pages describe how to *build* against the protocol and are silent on whether anything can be *installed* today. The answer only exists in an hour-long YouTube recording of the hackathon's live build session (https://youtu.be/ws61g53S2b4), where the Amazon developer-relations team say it plainly at ~[07:38]–[09:22] and ~[59:33]–[60:56]: *"right now you cannot take an SDK and control an Echo Show."* Alexa+ is rolling out country by country, and the MCP Toolkit is US-only.
* **Severity**: **High.** Not knowing this changes the whole shape of a submission. A solo entrant who never finds the video can burn days trying to deploy something that cannot be deployed by anyone, then conclude their own environment is broken — and a non-US entrant can reasonably conclude they are ineligible when they are not.
* **Workaround**: Built to the plain MCP standard and demonstrated the interaction through a simulated client, which the hosts explicitly endorsed as what Amazon's own internal teams did. This is recorded in the README's status table, with timestamps, so nobody mistakes the simulator for a device.
* **Suggested fix**: Put one availability box at the top of the Alexa+ track page: what exists today, what is US-only, what is coming, and what a submission is therefore expected to look like. A sentence in writing would have saved more time than the whole hour of video. And the console page itself should say more than "Coming Soon" — a developer who has already registered an account and clicked through to create an add-on is exactly the person who deserves to be told when, and what to build meanwhile.

---

### Entry 2: The spec version is stated as a minimum, and the SDK has no way to hold a floor

* **Task attempted**: Make the server genuinely comply with the resources page's stated minimum spec version of `2025-11-25`, not merely claim it.
* **Steps taken**: Built on `@modelcontextprotocol/sdk` 1.30.0, whose `types.js` exports:
  ```
  LATEST_PROTOCOL_VERSION             = '2025-11-25'
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION = '2025-03-26'
  SUPPORTED_PROTOCOL_VERSIONS         = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07']
  ```
  Then probed the running server with a client asking for each version in turn (`node ops/probe-protocol-version.mjs`).
* **Expected vs actual**: Expected a transport option of the shape `minProtocolVersion`, or at least a documented note that the supported list is a floorless range. There is neither, and the measured behaviour was that the server agreed to whatever the client asked for, down to a version a year older than the stated minimum:

  | client asks for | HTTP | negotiated (before fix) | negotiated (after fix) |
  | :--- | :--- | :--- | :--- |
  | `2025-11-25` (the stated minimum) | 200 | `2025-11-25` | `2025-11-25` |
  | `2025-06-18` | 200 | `2025-06-18` | `2025-11-25` |
  | `2025-03-26` (the SDK's own default) | 200 | `2025-03-26` | `2025-11-25` |
  | `2024-11-05` | 200 | `2024-11-05` | `2025-11-25` |
  | a version that does not exist | 200 | `2025-11-25` | `2025-11-25` |

  A README claiming "implements 2025-11-25" would have been true only of the best case. That is exactly the kind of claim this portfolio is not allowed to make.
* **Severity**: **Medium**, rising to high for anyone whose submission is *judged* on the version. The default is the trap: a client that does nothing special gets `2025-03-26`.
* **Workaround**: Mine, in `services/mcp-server/src/server.ts`. `PROTOCOL_FLOOR = '2025-11-25'`, and an `initialize` naming anything lower is raised to the floor before the transport sees it, so the handshake answers with the floor. That is the spec's own remedy — a server that will not serve the requested version responds with one it does support, and the client decides. Six tests in `tests/integration.test.ts` pin it, one per version in the supported list.
* **Suggested fix**: Add a `minProtocolVersion` option to `StreamableHTTPServerTransport` so a server can decline old clients without hand-editing request bodies. And on Amazon's side: if a minimum version is a requirement, say how to enforce it, because the SDK's default sits below it.

---

### Entry 3: A missing required parameter is reported as "Server not initialized"

* **Task attempted**: Understand why one probe case failed while the others returned 200 — the case where the client omits `protocolVersion` from `initialize` entirely.
* **Steps taken**: `node ops/probe-protocol-version.mjs`, last-but-one row.
* **Expected vs actual**: Expected JSON-RPC `-32602 Invalid params` naming the missing field. Got HTTP 400 with `-32000` and the message **"Bad Request: Server not initialized"**, which comes from `validateSession()` in the SDK's `webStandardStreamableHttp.js`. The request fails `InitializeRequest` schema validation, so it is no longer recognised as an initialization request, falls through to session validation, and is reported as if the *server* were in the wrong state. The true fault — one missing field in the client's payload — appears nowhere in the message.
* **Severity**: **Low-to-medium.** It is not a blocker, but it points the reader at the server when the bug is in the client. On a protocol whose whole first step is this handshake, it is the worst place to have a misleading diagnostic.
* **Workaround**: None needed once the cause is known; recorded here so the next person recognises it in one minute instead of thirty.
* **Suggested fix**: In the SDK, validate the `initialize` shape before falling through to session checks, and return `-32602` naming the offending field.

---

### Entry 4: No conformance harness for a Streamable HTTP server

* **Task attempted**: Prove the transport actually behaves as the spec requires, rather than merely working for the happy path our own client drives.
* **Steps taken**: Read the Streamable HTTP section of the spec and hand-wrote the negative paths: `POST /mcp` without both `application/json` and `text/event-stream` in `Accept` → **406**; `GET /mcp` without `text/event-stream` → **406**; a non-initialize request with no `MCP-Session-Id` → **400**; an unknown session id → **404**; a disallowed `Origin` → **403** (the spec's DNS-rebinding guard, which is easy to skip entirely because nothing fails without it); `DELETE /mcp` terminating a session → **204**.
* **Expected vs actual**: Expected an official conformance suite, or at least a checklist of MUSTs to assert against. Neither exists, so every server author derives the same tests from the same prose and some of them get it wrong in ways their own client will never reveal.
* **Severity**: **Medium.** It does not block a build; it silently lowers the floor for everyone's implementation.
* **Workaround**: Wrote the assertions by hand (`services/mcp-server/tests/integration.test.ts`, `tests/unit.test.ts`; 32 tests green).
* **Suggested fix**: Ship an official `mcp-conformance` runner that takes a base URL and reports pass/fail per MUST in the transport spec. For a hackathon that states a minimum spec version, this would also give judges a one-command way to check the claim.

---

### Entry 5: Nothing tells you that a tool description is a truthfulness surface

* **Task attempted**: Expose household electrical telemetry and a time-of-use tariff to an Alexa+-style client.
* **Steps taken**: Wrote `get_circuit_telemetry` the obvious way: a clear description, and a payload with the numbers in it.
* **Expected vs actual**: The obvious way produced something indefensible, and no page warned about it. The tool described itself as *"Query real-time electrical circuit power telemetry and current utility TOU tariff rate"*, and returned a named utility (Pacific Gas & Electric), a named schedule (E-TOU-C) and a rate ($0.48/kWh) beside a live ISO timestamp. Every one of those figures is a fixture. Read together by a model, they are a rate quote apparently pulled from a named utility seconds ago — and the client here is Alexa+, which will speak it to someone as their electricity bill. The MCP spec treats `description` as a routing hint; in practice it is the only thing the model has for deciding how much authority to grant an answer. Neither the spec nor the Alexa+ guidance says so, and neither offers a place to declare provenance.
* **Severity**: **High**, and design-level rather than mechanical. This is the failure mode the hackathon hosts said they are screening for — ~[54:03] *"beware of submitting something that you have a good glossy video and it's like vapor"* — arrived at by following the documented path.
* **Workaround**: Mine. Provenance now travels with the data in a `dataSource` block on every telemetry payload: simulated household, `liveRateFeed: false`, `liveMeter: false`, the tariff stated as modelling a published residential TOU structure rather than being warranted current, a reference URL, and an explicit instruction not to present the figures to a user as their actual bill. The description says SIMULATED and no longer says real-time. Two tests fail if either regresses — one asserting the `dataSource` block survives, one reading `tools/list` and failing if the description ever says "real-time" again.
* **Suggested fix**: Two things. In the MCP spec: a conventional, optional provenance field on tool results — something like `dataSource: { kind, live, asOf, basis, reference }` — so a client can distinguish measurement from illustration without parsing prose. In the Alexa+ guidance: a short section on tool output that will be spoken aloud, because a spoken figure carries more authority than the same figure on a screen, and a voice surface gives the listener no way to see the caveat.

---

### Entry 6: A localhost MCP server has no reachable client, and that shapes the demo

* **Task attempted**: Exercise the server the way Alexa+ eventually will — a real conversational client calling `tools/list`, staging an action, and handling a confirmation gate.
* **Steps taken**: Looked for any MCP client that could act as a stand-in for Alexa+. The MCP Toolkit is US-only; Alexa add-ons are not live (Entry 1); there is no emulator for the Alexa+ side of the conversation.
* **Expected vs actual**: Expected something like the Ring track's virtual device, which the same build session offers for Ring. The Alexa+ track has no equivalent, so the interaction model — the part the track says it is judged on — is the one part that cannot be tested against anything real.
* **Severity**: **Medium.** Work continues, but every entrant must first build the thing that tests the thing, and no two entrants' harnesses will agree.
* **Workaround**: Built `apps/simulator`, a web client that speaks real MCP Streamable HTTP over HTTP to the server — real handshake, real `tools/list`, real `tools/call`, real session header. It is a stand-in for Alexa+, not a mock of the server: nothing in the pipeline is faked between the two. `ops/verify-gate.mjs` then drives the same server over MCP without a browser, so the confirmation gate is proved by readings rather than by screenshots — staging leaves every circuit untouched (13.4 kW, `ev_charger` CHARGING), approval moves them (3.8 kW, `ev_charger` PAUSED), and the 9.6 kW the plan promised is the 9.60 kW it delivered.
* **Suggested fix**: A minimal reference client for the Alexa+ interaction — even a CLI that renders the turn-by-turn exchange — would let every entrant demonstrate the same thing the same way, and would let judges compare submissions on the server rather than on the quality of each entrant's improvised harness.

---

### Entry 7: `npm start` and the ops scripts ran two different servers, and only one of them had the fix

* **Task attempted**: Re-verify the protocol floor end to end before recording the demo, by bringing both halves up with `ops\run-both-detached.cmd` and running the probe against them.
* **Steps taken**: `ops\run-both-detached.cmd`, then `node ops/probe-protocol-version.mjs`.
* **Expected vs actual**: Expected all six rows to answer `2025-11-25`, as the README and the walkthrough both state. Got the **pre-fix** behaviour instead:

  ```
  client asks for 2025-06-18                           200  2025-06-18
  client asks for 2025-03-26 (the SDK default)          200  2025-03-26
  client asks for 2024-11-05                           200  2024-11-05
  ```

  The cause is a split entry point. `package.json` has `"start": "tsx src/index.ts"` — source — while `"main"` points at `dist/index.js`, and two `ops/` scripts launched `node dist\index.js`. `dist/` is gitignored, so it is a local artefact that only changes when someone remembers `npm run build`. The floor was fixed in `src/server.ts`; `dist` still held the old emit. Every test passed the whole time, because the tests import the source. So the repository was correct, the test suite was honest, the documentation was accurate about the source — and the server a judge would actually have reached by following step 5 of the walkthrough was a build that no longer existed in the repository.
* **Severity**: **High.** Not a crash, and nothing in any log looked wrong. It is the specific shape of failure that survives a green suite: the artefact under test and the artefact under demonstration are different files. The same class of bug cost Project 1 two days (an env var that compiled to `undefined` while its tests read the same `undefined`), which is the only reason I thought to run the probe against the script rather than against `npm start`.
* **Workaround**: None needed once found — but "rebuild before demoing" is a rule that fails the first time someone is in a hurry, so it is not the fix.
* **Fix applied**: Both scripts now start the server from source through `npm start`, via a small `ops/_launch-server.cmd` (a launcher file, because `start "" cmd /c "cd /d ""path with spaces"" && ..."` silently ran nothing here — no process, no port, no log). One entry point, one code path, no artefact to serve by accident. And `services/mcp-server/tests/ops-entrypoints.test.ts` now reads every `.cmd` in `ops/` and fails the build if one launches `node dist/`. It earned its place immediately: it caught a **second** script, `ops/verify-live.cmd`, which had the same defect and whose whole job is to verify the live transport — it had been verifying a stale binary and reporting success.
* **Suggested fix (for the toolchain, not just us)**: When `package.json` declares both a `main` pointing at a build directory and a `start` script that runs the sources, those are two different programs sharing one name. `npm start` could warn when `main` exists on disk and is older than the newest file in `src/`. It is a two-line check and it would have saved this hour.

---

## Where each entry can be reproduced

| Entry | Reproduce with |
| :--- | :--- |
| 1 | The Alexa+ track and Agent Skills pages, against https://youtu.be/ws61g53S2b4 ~[07:38]–[09:22] |
| 2 | `ops\run-mcp.cmd`, then `node ops/probe-protocol-version.mjs` |
| 3 | Same probe, the "omits protocolVersion entirely" row |
| 4 | `cd services/mcp-server && npm test` (32 tests, including the six negative transport paths) |
| 5 | `tools/list` on a running server; `services/mcp-server/tests/unit.test.ts` |
| 6 | `ops\run-both-detached.cmd`, then `node ops/verify-gate.mjs` |
| 7 | `git stash` the fix, run `ops\run-both-detached.cmd` and the probe, and watch the rows answer the client's own version. Or just read `tests/ops-entrypoints.test.ts`, which fails the build if it comes back. |
