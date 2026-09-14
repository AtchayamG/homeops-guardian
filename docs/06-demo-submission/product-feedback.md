# Product Feedback — HomeOps Guardian (Alexa+ / MCP)

> **Amazon Developer Hackathon (Build, Ship, Shape 2026)** — mandatory submission requirement 4
> **Project**: HomeOps Guardian · **Entrant**: Atchayam G (solo)
> **Environment**: Windows 11, Node.js v22.22.3, TypeScript 5.7, `@modelcontextprotocol/sdk` 1.30.0

Feedback on each tool, API and SDK this project actually used. The
[friction log](friction-log.md) has the reproducible detail; this document
answers the questions the submission form asks — setup, docs, testing,
performance, reliability, onboarding, and whether I would build on it again.

---

## 1. Model Context Protocol — Streamable HTTP transport (spec `2025-11-25`)

**What I built with it**: the whole server. A single `/mcp` endpoint handling
POST (JSON-RPC), GET (SSE stream) and DELETE (session termination), with
`MCP-Session-Id` issuance and validation, origin checking, and four tools.

**What worked well**

- The transport is small enough to hold in your head. One endpoint, three
  methods, one session header. I had a spec-shaped handshake working within an
  hour of reading the page, which is not true of most protocols.
- Making session identity a response header rather than a body field means
  ordinary HTTP tooling — curl, a browser devtools network tab, `supertest` —
  is enough to debug it. I never needed a protocol-specific inspector.
- The negative paths are specified precisely enough to test: 406 on a bad
  `Accept`, 400 on a missing session, 404 on an unknown one. Prose that
  translates directly into assertions is rarer than it should be.
- The origin-checking requirement (DNS-rebinding protection) is called out
  explicitly. It would have been easy to leave out, because nothing fails
  without it, and I would not have thought of it unaided.

**What needs improvement**

1. **There is no conformance harness.** Every server author derives the same
   tests from the same prose, and a server can be wrong in ways its own client
   will never expose. An official `mcp-conformance <base-url>` runner that
   reports pass/fail per MUST would raise the floor for every implementation,
   and would give a hackathon judge a one-command way to check a claim rather
   than taking a README's word for it. This is my single highest-value ask.
2. **`description` is load-bearing and the spec does not say so.** A tool
   description is not a routing hint in practice — it is the only signal the
   model has for how much authority to grant the answer. Mine said "real-time"
   over fixture data, and that was the first link in a chain ending with a
   fabricated electricity rate being spoken to a user as their bill. See
   friction-log Entry 5. What is missing is a conventional, optional
   provenance field on tool *results* — something like
   `dataSource: { kind, live, asOf, basis, reference }` — so a client can tell
   measurement from illustration without parsing prose. I ended up inventing
   exactly that field; standardising it would mean clients could act on it.
3. **A stated minimum spec version cannot be enforced.** Detail in feedback
   section 2 below, since it is really an SDK gap.

**Onboarding**: good. The transport page plus the JSON-RPC basics were enough
to get from nothing to a working handshake without a sample project.

**Would I build on it again?** Yes, without hesitation. It is the most
pleasant protocol I have implemented from a spec in a long time. The gaps are
around it — tooling and conventions — not in it.

---

## 2. `@modelcontextprotocol/sdk` (TypeScript), version 1.30.0

**What I built with it**: `McpServer` + `StreamableHTTPServerTransport` behind
Express, with zod-typed tool inputs.

**What worked well**

- `server.tool(name, description, schema, handler)` is the right shape. Zod
  schemas become the advertised JSON Schema automatically, so `tools/list` and
  the runtime validation cannot drift apart. That is a real class of bug the
  SDK simply removes.
- `enableJsonResponse: true` let me serve plain JSON responses where SSE would
  have been overkill, which made the server testable with `supertest` and made
  the simulator client trivial.
- Mounting the transport inside my own Express app, rather than having it own
  the server, meant I could keep origin checks, health probes and the static
  simulator in one process. Frameworks that insist on owning `listen()` make
  that awkward; this one did not.
- Version 1.30.0 tracks `2025-11-25` as `LATEST_PROTOCOL_VERSION`, so the
  newest spec was available the day I needed it.

**What needs improvement**

1. **No `minProtocolVersion` option.** `SUPPORTED_PROTOCOL_VERSIONS` spans
   `2025-11-25` down to `2024-10-07` and there is no way to decline the old
   ones. Measured on my own server before I worked around it: a client asking
   for `2024-11-05` got HTTP 200 and a handshake agreeing to `2024-11-05`.
   Worse, `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` is `2025-03-26`, so the
   *default* sits below the version this hackathon states as its minimum. My
   workaround is to rewrite below-floor `initialize` requests up to the floor
   before the transport sees them, which is not something a builder should have
   to do by hand. **Priority: high** — this one silently makes README claims
   false.
2. **A missing required param is reported as "Server not initialized".** Omit
   `protocolVersion` from `initialize` and the request fails
   `InitializeRequest` validation, stops being recognised as an
   initialization, falls through to `validateSession()`, and returns
   `-32000 Bad Request: Server not initialized`. The message points at the
   server when the fault is one missing field in the client. Returning
   `-32602 Invalid params` naming the field would save everyone the same
   half-hour. **Priority: medium.**
3. **The two protocol-version constants need a documented relationship.**
   `LATEST_PROTOCOL_VERSION`, `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` and
   `SUPPORTED_PROTOCOL_VERSIONS` are all exported, and nothing explains which
   one governs what a given handshake ends up speaking. I found out by probing
   a live server. **Priority: low**, but it is a two-paragraph docs fix.

**Testing and reliability**: solid. 22 tests across two suites, including six
negative transport paths and a six-case protocol-floor matrix, run green and
repeatably on `jest --runInBand`. No flakes, no open-handle leaks once
`--detectOpenHandles --forceExit` was set. Nothing in the SDK misbehaved
during the build; every problem above is a missing affordance, not a defect.

**Performance**: never a concern at this scale, and I want to be honest that
this is therefore not a useful data point about the SDK. Nothing here is under
load; a localhost handshake and `tools/call` return fast enough that I never
measured them, which means I cannot tell you how the transport behaves under
concurrency or across a real network.

**Would I build on it again?** Yes. Add `minProtocolVersion` and I would have
nothing structural left to ask for.

---

## 3. Alexa+ as a target platform (track documentation and availability)

**What I built with it**: nothing on a device, because nothing can be built on
a device yet — and that fact is the feedback.

**What needs improvement**

1. **Say in writing what exists today.** Alexa add-ons are not live; there is
   no SDK that can drive an Echo device; the MCP Toolkit is US-only; Alexa+ is
   rolling out country by country. All of that is true, all of it shapes what a
   submission can possibly be — and the only place I found it stated was an
   hour-long recording of the hackathon's own live build session
   (https://youtu.be/ws61g53S2b4, ~[07:38]–[09:22] and ~[59:33]–[60:56]:
   *"right now you cannot take an SDK and control an Echo Show."*). A solo
   entrant outside the US who never finds that video can reasonably conclude
   their environment is broken, or that they are ineligible. Neither is true.
   One availability box at the top of the track page fixes it.
   **Priority: highest of anything in this document.** It costs a paragraph.
2. **There is no reference client for the Alexa+ side of the conversation.**
   The Ring track offers a virtual device; the Alexa+ track offers nothing
   equivalent, so the interaction model — the part the track says it is judged
   on — is the one part no entrant can test against anything real. Every
   entrant builds their own harness, no two agree, and judges end up comparing
   improvised harnesses rather than servers. Even a CLI that rendered the
   turn-by-turn exchange against a given MCP endpoint would fix this.
   **Priority: high.**
3. **Guidance is needed for tool output that will be spoken aloud.** A figure
   read out by a voice assistant carries more authority than the same figure on
   a screen, and the listener has no way to see a caveat. If a tool returns a
   utility rate, a dosage, a balance or a deadline, the platform should say
   what the developer owes the listener: mark simulated or derived data, state
   as-of times, and never let a fixture reach a speech surface unlabelled.
   I had to work this out after shipping the mistake. **Priority: high**, and
   it is the kind of guidance that gets more important as Alexa+ gains reach,
   not less.

**What worked well**: the live build session itself was excellent, and the
hosts answered every question I had on the record — including explicitly
blessing a simulated client as a legitimate demonstration, which is what made
this project possible from outside the US. The problem is not the information;
it is that it lives in video rather than in documentation.

**Would I build for it again?** Yes — and I intend to, once add-ons ship. The
shape of the opportunity is clear and MCP is the right foundation for it. What
I want before then is a page that tells me what I can and cannot do today.

---

## 4. Supporting tools used at runtime or in the build

| Tool | Used for | Verdict |
| :--- | :--- | :--- |
| **Node.js 22 / `tsx`** | Running the TypeScript server directly, no build step in dev | Excellent. `tsx src/index.ts` removed an entire build-watch loop from the inner dev cycle. |
| **Express 4** | Hosting the MCP transport plus `/health` and the static simulator | Excellent, and the right choice specifically because the MCP transport does not insist on owning the HTTP server. |
| **zod 3** | Tool input schemas, surfaced through `tools/list` | Excellent. One definition serves both validation and advertisement. |
| **Jest 29 + `supertest` + ts-jest (ESM)** | 22 tests | Good once configured; ESM + `--experimental-vm-modules` is still fiddly to get right and the error you get when it is wrong does not point at the cause. |
| **Vite** | The simulator client | Excellent. Production build of the simulator completes in 115 ms; nothing to say against it. |

---

## 5. Feature requests, in priority order

1. **An official MCP conformance runner** (`mcp-conformance <url>`) reporting
   pass/fail per transport MUST. Highest leverage item in this document: it
   would improve every server in the ecosystem and let judges verify claims.
2. **An availability box on the Alexa+ track page** stating what ships today,
   what is US-only, and what a submission is therefore expected to look like.
3. **`minProtocolVersion` on `StreamableHTTPServerTransport`**, so a stated
   minimum spec version can be honoured without rewriting request bodies.
4. **A conventional provenance field on tool results** — `dataSource` or
   similar — so simulated and derived data can be distinguished from
   measurement by machine, not by prose.
5. **A reference client for the Alexa+ interaction**, even a CLI.
6. **`-32602 Invalid params` for a malformed `initialize`**, instead of
   "Server not initialized".

---

## 6. Would I build on this stack again?

Yes, and the honest reason is narrower than enthusiasm. MCP made the hard part
easy: I spent my time on what the tools should say and how a confirmation gate
should behave, not on transport plumbing. Everything I would change is
adjacent to the protocol — a conformance runner, an availability page, a
version floor, a provenance convention — and all four are additions rather
than corrections. That is a good position for a young standard to be in.

The one thing I would do differently myself: write the provenance block before
writing the tool, not after discovering that my tool had been quoting a
fabricated electricity rate with a live timestamp beside it. The platform did
not cause that mistake, but it also did nothing to prevent it, and on a voice
surface that gap matters more than it would anywhere else.
