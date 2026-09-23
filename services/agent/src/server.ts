import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BedrockPlanner, ScriptedPlanner, runAgentTurn, type AgentEvent } from './planner.js';

type Emit = (event: AgentEvent | { type: 'human_confirmation_required'; elicitationId: string; message: string } |
  { type: 'mcp_frame'; direction: 'request' | 'response'; frame: unknown }) => void;
interface Session { client: Client; transport: StreamableHTTPClientTransport; emit?: Emit; active: boolean }
interface Pending { sessionId: string; finish: (approve: boolean) => void; timer: NodeJS.Timeout }

export function createAgentApp() {
  const app = express();
  const sessions = new Map<string, Session>();
  const pending = new Map<string, Pending>();
  const allowedOrigins = ['http://127.0.0.1:5173', 'http://localhost:5173'];

  app.use(cors({ origin: (origin, done) => done(null, !origin || allowedOrigins.includes(origin)) }));
  app.use((req: Request, res: Response, next) => {
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
      return res.status(403).json({ error: 'Forbidden Origin' });
    }
    next();
  });
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'homeops-agent' }));

  async function getSession(sessionId: string, emit: Emit): Promise<Session> {
    const existing = sessions.get(sessionId);
    if (existing) {
      if (!existing.active) existing.emit = emit;
      return existing;
    }

    const client = new Client({ name: 'homeops-human-agent', version: '0.1.0' });
    client.registerCapabilities({ elicitation: { form: {} } });
    const session: Session = { client, transport: undefined as any, emit, active: false };
    client.setRequestHandler(ElicitRequestSchema, async request => {
      const elicitationId = randomUUID();
      return await new Promise<{ action: 'accept' | 'decline'; content?: { approve: boolean } }>(resolve => {
        const timer = setTimeout(() => {
          pending.delete(elicitationId);
          resolve({ action: 'decline' });
        }, 55_000);
        pending.set(elicitationId, {
          sessionId, timer,
          finish: approve => {
            clearTimeout(timer);
            pending.delete(elicitationId);
            resolve(approve ? { action: 'accept', content: { approve: true } } : { action: 'decline' });
          }
        });
        session.emit?.({ type: 'human_confirmation_required', elicitationId, message: request.params.message });
      });
    });

    const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:3001/mcp'), {
      fetch: async (url, init) => {
        if (typeof init?.body === 'string') {
          try { session.emit?.({ type: 'mcp_frame', direction: 'request', frame: JSON.parse(init.body) }); } catch { /* no JSON frame */ }
        }
        return fetch(url, init);
      }
    });
    session.transport = transport;
    await client.connect(transport);
    const original = transport.onmessage;
    transport.onmessage = frame => {
      session.emit?.({ type: 'mcp_frame', direction: 'response', frame });
      original?.(frame);
    };
    sessions.set(sessionId, session);
    return session;
  }

  app.post('/agent/confirm', (req: Request, res: Response) => {
    const { elicitationId, approve } = req.body ?? {};
    if (typeof elicitationId !== 'string' || typeof approve !== 'boolean') {
      return res.status(400).json({ error: 'elicitationId and boolean approve required' });
    }
    const decision = pending.get(elicitationId);
    if (!decision) return res.status(404).json({ error: 'Elicitation not pending' });
    decision.finish(approve);
    return res.json({ status: approve ? 'accepted' : 'declined' });
  });

  app.post('/agent/turn', async (req: Request, res: Response) => {
    const { sessionId, utterance } = req.body ?? {};
    if (typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(sessionId) ||
        typeof utterance !== 'string' || !utterance.trim()) {
      return res.status(400).json({ error: 'UUID sessionId and utterance required' });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const emit: Emit = event => res.write(`data: ${JSON.stringify(event)}\n\n`);
    let session: Session | undefined;
    let ownsTurn = false;
    try {
      session = await getSession(sessionId, emit);
      if (session.active) {
        emit({ type: 'agent_unavailable', errorName: 'SESSION_BUSY' });
        return;
      }
      session.active = true;
      ownsTurn = true;
      let toolCalls = 0;
      const trackedEmit: Emit = event => {
        if (event.type === 'tool_call') toolCalls++;
        emit(event);
      };
      session.emit = trackedEmit;
      try {
        await runAgentTurn(new BedrockPlanner(), session.client as any, utterance, trackedEmit);
      } catch (error) {
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        trackedEmit({ type: 'agent_unavailable', errorName });
        // Fallback is safe only before a real tool call has changed any state.
        if (toolCalls === 0) {
          await runAgentTurn(new ScriptedPlanner(utterance), session.client as any, utterance, trackedEmit);
        }
      }
    } catch (error) {
      emit({ type: 'agent_unavailable', errorName: error instanceof Error ? error.name : 'UnknownError' });
    } finally {
      if (session && ownsTurn) { session.active = false; session.emit = undefined; }
      res.end();
    }
  });

  return { app, sessions, pending };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createAgentApp().app.listen(3003, '127.0.0.1', () => {
    console.log('HomeOps agent listening on http://127.0.0.1:3003');
  });
}
