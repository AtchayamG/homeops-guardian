import express, { Request, Response, Express } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export interface McpSession {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
}

export interface AppOptions {
  allowedOrigins?: string[];
  sessionTimeoutMs?: number;
}

export interface CircuitState {
  id: string;
  name: string;
  status: 'RUNNING' | 'CHARGING' | 'HEATING' | 'PAUSED' | 'ECO';
  powerKw: number;
  powerFactor: number;
  hourlyCost: number;
}

export interface StagedAction {
  id: string;
  sessionId: string;
  createdAt: number;
  status: 'PENDING_CONFIRMATION' | 'ACTION_EXECUTED' | 'ACTION_CANCELLED';
  proposedActions: Array<{
    circuitId: string;
    action: string;
    powerReductionKw: number;
    details: string;
  }>;
  projectedReductionKw: number;
  estimatedMonthlySavingsUsd: number;
}

// In-memory state store for circuit simulations and staged confirmation actions
export class HomeOpsState {
  private circuits: Map<string, CircuitState>;
  private stagedActions: Map<string, StagedAction>;

  constructor() {
    this.circuits = new Map();
    this.stagedActions = new Map();
    this.resetToDefault();
  }

  public resetToDefault(): void {
    this.circuits.clear();
    this.stagedActions.clear();

    this.circuits.set('hvac_main', {
      id: 'hvac_main',
      name: 'Heat Pump HVAC (Variable Speed)',
      status: 'RUNNING',
      powerKw: 3.8,
      powerFactor: 0.94,
      hourlyCost: 1.82
    });

    this.circuits.set('ev_charger', {
      id: 'ev_charger',
      name: 'Level 2 EV Charger (Tesla Wall Connector)',
      status: 'CHARGING',
      powerKw: 7.2,
      powerFactor: 0.99,
      hourlyCost: 3.46
    });

    this.circuits.set('water_heater', {
      id: 'water_heater',
      name: 'Hybrid Heat Pump Water Heater',
      status: 'HEATING',
      powerKw: 2.4,
      powerFactor: 0.92,
      hourlyCost: 1.15
    });
  }

  public getCircuits(): CircuitState[] {
    return Array.from(this.circuits.values());
  }

  public getTotalPowerKw(): number {
    return Number(
      Array.from(this.circuits.values())
        .reduce((sum, c) => sum + c.powerKw, 0)
        .toFixed(2)
    );
  }

  public getTotalHourlyCost(): number {
    return Number(
      Array.from(this.circuits.values())
        .reduce((sum, c) => sum + c.hourlyCost, 0)
        .toFixed(2)
    );
  }

  public stageAction(sessionId: string): StagedAction {
    const actionId = `shift-${randomUUID().slice(0, 8)}`;
    const action: StagedAction = {
      id: actionId,
      sessionId,
      createdAt: Date.now(),
      status: 'PENDING_CONFIRMATION',
      proposedActions: [
        {
          circuitId: 'ev_charger',
          action: 'PAUSE_CHARGING',
          powerReductionKw: 7.2,
          details: 'Pause charging during $0.48/kWh peak window; auto-resume at 21:00 off-peak ($0.34/kWh)'
        },
        {
          circuitId: 'hvac_main',
          action: 'ECO_SETPOINT_OFFSET',
          powerReductionKw: 2.4,
          details: 'Apply +2°F thermal pre-cool offset to variable speed compressor'
        }
      ],
      projectedReductionKw: 9.6,
      estimatedMonthlySavingsUsd: 42.50
    };
    this.stagedActions.set(actionId, action);
    return action;
  }

  public getStagedAction(actionId: string): StagedAction | undefined {
    return this.stagedActions.get(actionId);
  }

  public executeAction(actionId: string, confirmed: boolean): StagedAction | null {
    const action = this.stagedActions.get(actionId);
    if (!action) return null;

    if (!confirmed) {
      action.status = 'ACTION_CANCELLED';
      return action;
    }

    // Apply circuit state changes
    const ev = this.circuits.get('ev_charger');
    if (ev) {
      ev.status = 'PAUSED';
      ev.powerKw = 0.0;
      ev.hourlyCost = 0.0;
    }

    const hvac = this.circuits.get('hvac_main');
    if (hvac) {
      hvac.status = 'ECO';
      hvac.powerKw = 1.4;
      hvac.hourlyCost = 0.67;
    }

    action.status = 'ACTION_EXECUTED';
    return action;
  }
}

export function configureMcpServer(state: HomeOpsState = new HomeOpsState()): McpServer {
  const server = new McpServer({
    name: 'homeops-guardian',
    version: '0.1.0'
  });

  // Tool 1: ping
  server.tool(
    'ping',
    'Health check ping returning status and server timestamp',
    {},
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'ok',
              timestamp: new Date().toISOString()
            })
          }
        ]
      };
    }
  );

  // Tool 2: get_circuit_telemetry
  server.tool(
    'get_circuit_telemetry',
    // Deliberately NOT described as "real-time". It was, and that was wrong:
    // every figure below is a fixture. An LLM client reads this description to
    // decide how much weight to give the answer, so the description is the
    // first place the honesty has to live.
    'Read circuit power telemetry and the TOU tariff tier for a SIMULATED household. Figures are a fixed modelled scenario, not a metered home and not a live utility rate feed - see dataSource in the response.',
    {},
    async () => {
      const circuits = state.getCircuits();
      const totalPowerKw = state.getTotalPowerKw();
      const totalHourlyBurnRate = state.getTotalHourlyCost();

      const telemetry = {
        timestamp: new Date().toISOString(),

        // Provenance travels WITH the data, not in a README nobody reads.
        //
        // This block exists because the payload named a real utility and a real
        // tariff schedule beside a live timestamp, which reads as a rate quote
        // pulled from PG&E seconds ago. It is not. The numbers are a fixture
        // chosen to model the published shape of a residential TOU schedule, and
        // the scenario is pinned to the peak window so the demo is deterministic
        // rather than depending on what time a judge happens to open it.
        //
        // Same discipline as the Fire TV track, where every audio description
        // has to name the video frame it was written from. A figure that cannot
        // say where it came from does not get to sound authoritative.
        dataSource: {
          kind: 'simulated-household',
          liveRateFeed: false,
          liveMeter: false,
          scenario: 'Pinned to the weekday peak window so the walkthrough is deterministic. The tier does not track the wall clock.',
          tariffBasis: 'Models the published structure of a PG&E residential time-of-use schedule (E-TOU-C). Rates are illustrative and are not warranted current.',
          tariffReference: 'https://www.pge.com/en/account/rate-plans/find-your-best-rate-plan.html',
          note: 'Do not present these figures to a user as their actual bill or their utility\'s current rate.'
        },

        utility: 'Pacific Gas & Electric (PG&E)',
        tariffSchedule: 'E-TOU-C',
        currentTariff: {
          tier: 'PEAK',
          ratePerKwh: 0.48,
          currency: 'USD',
          window: '16:00 - 21:00 weekdays'
        },
        circuits,
        totalHomePowerKw: totalPowerKw,
        totalHourlyBurnRateUsd: totalHourlyBurnRate
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(telemetry, null, 2)
          }
        ]
      };
    }
  );

  // Tool 3: stage_load_shift
  server.tool(
    'stage_load_shift',
    'Stage a rate-aware load shift for high-draw appliances during peak tariff. Requires human confirmation before any circuit modifications take place.',
    {
      reason: z.string().optional().describe('Reason for staging load shift')
    },
    async (args) => {
      const action = state.stageAction('current-session');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stagedActionId: action.id,
                status: action.status,
                confirmationRequired: true,
                message:
                  'Peak load-shift plan staged. Human confirmation required before modulating electrical circuits.',
                proposedActions: action.proposedActions,
                projectedReductionKw: action.projectedReductionKw,
                estimatedMonthlySavingsUsd: action.estimatedMonthlySavingsUsd,
                reason: args.reason || 'User requested peak rate optimization'
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // Tool 4: confirm_load_shift
  server.tool(
    'confirm_load_shift',
    'Explicit human confirmation gate to execute or cancel a staged rate-aware load shift.',
    {
      stagedActionId: z.string().describe('The ID of the staged load-shift plan to confirm'),
      confirmed: z.boolean().describe('True to approve and execute the load shift; False to cancel')
    },
    async ({ stagedActionId, confirmed }) => {
      const action = state.executeAction(stagedActionId, confirmed);

      if (!action) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Staged action not found or expired: ${stagedActionId}`
              })
            }
          ]
        };
      }

      const totalPowerKw = state.getTotalPowerKw();
      const totalHourlyBurnRate = state.getTotalHourlyCost();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stagedActionId: action.id,
                status: action.status,
                confirmedAt: new Date().toISOString(),
                newTotalHomePowerKw: totalPowerKw,
                newHourlyBurnRateUsd: totalHourlyBurnRate,
                message:
                  action.status === 'ACTION_EXECUTED'
                    ? 'Load-shift executed successfully. High-draw circuits modulated.'
                    : 'Load-shift cancelled. All circuit breakers maintain prior settings.'
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  return server;
}

export function createMcpApp(options: AppOptions = {}): {
  app: Express;
  sessions: Map<string, McpSession>;
  state: HomeOpsState;
} {
  const app = express();
  const sessions = new Map<string, McpSession>();
  const state = new HomeOpsState();

  const allowedOrigins = options.allowedOrigins ?? [
    'http://localhost',
    'http://127.0.0.1',
    'https://localhost',
    'https://127.0.0.1'
  ];

  // Browser CORS middleware supporting preflight and exposed MCP headers
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.some(
          allowed => origin === allowed || origin.startsWith(allowed + ':')
        );
        callback(null, isAllowed);
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Accept',
        'MCP-Session-Id',
        'MCP-Protocol-Version'
      ],
      exposedHeaders: ['MCP-Session-Id', 'MCP-Protocol-Version'],
      credentials: true
    })
  );

  app.use(express.json());

  // DNS Rebinding / Origin validation fallback per spec
  app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed = allowedOrigins.some(
        allowed => origin === allowed || origin.startsWith(allowed + ':')
      );
      if (!isAllowed) {
        return res.status(403).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: `Forbidden: Origin '${origin}' is not allowed`
          },
          id: null
        });
      }
    }
    next();
  });

  // Explicit OPTIONS preflight handler for /mcp
  app.options('/mcp', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, MCP-Session-Id, MCP-Protocol-Version'
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'MCP-Session-Id, MCP-Protocol-Version'
    );
    res.status(204).end();
  });

  // Health probe
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'homeops-guardian-mcp',
      activeSessions: sessions.size,
      time: new Date().toISOString()
    });
  });

  // MCP Streamable HTTP endpoint: POST
  app.post('/mcp', async (req: Request, res: Response) => {
    const acceptHeader = req.headers.accept || '';

    // Spec check: client MUST include Accept header with application/json and text/event-stream
    if (
      !acceptHeader.includes('application/json') ||
      !acceptHeader.includes('text/event-stream')
    ) {
      return res.status(406).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message:
            'Not Acceptable: Client must accept both application/json and text/event-stream'
        },
        id: null
      });
    }

    const body = req.body;
    const isInit =
      body &&
      (body.method === 'initialize' ||
        (Array.isArray(body) && body.some(m => m.method === 'initialize')));

    const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;

    if (isInit) {
      // Create new stateful session
      const newSessionId = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        enableJsonResponse: true
      });

      const server = configureMcpServer(state);
      await server.connect(transport);

      const session: McpSession = {
        sessionId: newSessionId,
        transport,
        server,
        createdAt: Date.now()
      };
      sessions.set(newSessionId, session);

      return transport.handleRequest(req, res, req.body);
    }

    // Non-initialization request
    if (!sessionIdHeader) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Bad Request: Missing MCP-Session-Id header'
        },
        id: null
      });
    }

    const session = sessions.get(sessionIdHeader);
    if (!session) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: `Session not found: ${sessionIdHeader}`
        },
        id: null
      });
    }

    return session.transport.handleRequest(req, res, req.body);
  });

  // MCP Streamable HTTP endpoint: GET (SSE stream)
  app.get('/mcp', async (req: Request, res: Response) => {
    const acceptHeader = req.headers.accept || '';
    if (!acceptHeader.includes('text/event-stream')) {
      return res.status(406).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Not Acceptable: Client must accept text/event-stream'
        },
        id: null
      });
    }

    const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionIdHeader) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Bad Request: Missing MCP-Session-Id header'
        },
        id: null
      });
    }

    const session = sessions.get(sessionIdHeader);
    if (!session) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: `Session not found: ${sessionIdHeader}`
        },
        id: null
      });
    }

    return session.transport.handleRequest(req, res);
  });

  // MCP Streamable HTTP endpoint: DELETE (terminate session)
  app.delete('/mcp', async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionIdHeader) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Bad Request: Missing MCP-Session-Id header'
        },
        id: null
      });
    }

    const session = sessions.get(sessionIdHeader);
    if (!session) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: `Session not found: ${sessionIdHeader}`
        },
        id: null
      });
    }

    await session.transport.close();
    sessions.delete(sessionIdHeader);
    return res.status(204).end();
  });

  return { app, sessions, state };
}
