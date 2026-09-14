export interface NetworkLogEntry {
  id: number;
  timestamp: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  durationMs: number;
}

export interface ToolCallResult {
  success: boolean;
  toolName: string;
  arguments: Record<string, unknown>;
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
  durationMs: number;
  rawResponse: unknown;
  sessionId: string;
}

export class McpClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private protocolVersion: string = '2025-11-25';
  private messageId: number = 1;
  private isConnected: boolean = false;
  private serverInfo: { name: string; version: string } | null = null;
  private availableTools: Array<{ name: string; description: string; inputSchema: unknown }> = [];
  private networkLogs: NetworkLogEntry[] = [];
  private onLogCallbacks: Array<(log: NetworkLogEntry) => void> = [];

  constructor(baseUrl: string = 'http://127.0.0.1:3001') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public onLog(callback: (log: NetworkLogEntry) => void): void {
    this.onLogCallbacks.push(callback);
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getServerInfo(): { name: string; version: string } | null {
    return this.serverInfo;
  }

  public getConnected(): boolean {
    return this.isConnected;
  }

  public getTools(): Array<{ name: string; description: string }> {
    return this.availableTools;
  }

  public getLogs(): NetworkLogEntry[] {
    return this.networkLogs;
  }

  public async checkHealth(): Promise<{ ok: boolean; status?: string; service?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: data.status, service: data.service };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  public async initialize(): Promise<{ success: boolean; error?: string }> {
    const startTime = performance.now();
    const reqHeaders: Record<string, string> = {
      'Accept': 'application/json, text/event-stream',
      'Content-Type': 'application/json'
    };

    const reqBody = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'initialize',
      params: {
        protocolVersion: this.protocolVersion,
        capabilities: {},
        clientInfo: {
          name: 'alexa-plus-simulator',
          version: '0.1.0'
        }
      }
    };

    try {
      const res = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(reqBody)
      });

      const durationMs = Math.round(performance.now() - startTime);
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      const sessionIdHeader = res.headers.get('mcp-session-id');
      const resBody = await res.json();

      const logEntry: NetworkLogEntry = {
        id: this.networkLogs.length + 1,
        timestamp: new Date().toISOString(),
        method: 'POST',
        url: `${this.baseUrl}/mcp (initialize)`,
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        responseStatus: res.status,
        responseHeaders: resHeaders,
        responseBody: resBody,
        durationMs
      };

      this.networkLogs.push(logEntry);
      this.notifyLog(logEntry);

      if (res.ok && resBody.result) {
        this.sessionId = sessionIdHeader || null;
        this.isConnected = true;
        this.serverInfo = resBody.result.serverInfo || null;

        // Fetch tool catalog immediately following initialization
        await this.listTools();

        return { success: true };
      } else {
        this.isConnected = false;
        return {
          success: false,
          error: resBody.error?.message || `HTTP ${res.status}: Failed to initialize session`
        };
      }
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      this.isConnected = false;
      const errorMsg = err instanceof Error ? err.message : 'Network error';

      const logEntry: NetworkLogEntry = {
        id: this.networkLogs.length + 1,
        timestamp: new Date().toISOString(),
        method: 'POST',
        url: `${this.baseUrl}/mcp (initialize)`,
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        responseStatus: 0,
        responseHeaders: {},
        responseBody: { error: errorMsg },
        durationMs
      };
      this.networkLogs.push(logEntry);
      this.notifyLog(logEntry);

      return { success: false, error: errorMsg };
    }
  }

  public async listTools(): Promise<{ success: boolean; tools?: Array<{ name: string; description: string }> }> {
    if (!this.sessionId) {
      return { success: false };
    }

    const startTime = performance.now();
    const reqHeaders: Record<string, string> = {
      'Accept': 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Session-Id': this.sessionId,
      'MCP-Protocol-Version': this.protocolVersion
    };

    const reqBody = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/list',
      params: {}
    };

    try {
      const res = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(reqBody)
      });

      const durationMs = Math.round(performance.now() - startTime);
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      const resBody = await res.json();

      const logEntry: NetworkLogEntry = {
        id: this.networkLogs.length + 1,
        timestamp: new Date().toISOString(),
        method: 'POST',
        url: `${this.baseUrl}/mcp (tools/list)`,
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        responseStatus: res.status,
        responseHeaders: resHeaders,
        responseBody: resBody,
        durationMs
      };
      this.networkLogs.push(logEntry);
      this.notifyLog(logEntry);

      if (res.ok && resBody.result?.tools) {
        this.availableTools = resBody.result.tools;
        return { success: true, tools: this.availableTools };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  }

  public async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<ToolCallResult> {
    if (!this.sessionId) {
      throw new Error('Not connected: MCP Session ID is missing. Re-initialize first.');
    }

    const startTime = performance.now();
    const reqHeaders: Record<string, string> = {
      'Accept': 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Session-Id': this.sessionId,
      'MCP-Protocol-Version': this.protocolVersion
    };

    const reqBody = {
      jsonrpc: '2.0',
      id: this.messageId++,
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    };

    try {
      const res = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(reqBody)
      });

      const durationMs = Math.round(performance.now() - startTime);
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      const resBody = await res.json();

      const logEntry: NetworkLogEntry = {
        id: this.networkLogs.length + 1,
        timestamp: new Date().toISOString(),
        method: 'POST',
        url: `${this.baseUrl}/mcp (tools/call: ${name})`,
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        responseStatus: res.status,
        responseHeaders: resHeaders,
        responseBody: resBody,
        durationMs
      };
      this.networkLogs.push(logEntry);
      this.notifyLog(logEntry);

      if (res.ok && resBody.result) {
        return {
          success: true,
          toolName: name,
          arguments: args,
          content: resBody.result.content,
          isError: resBody.result.isError,
          durationMs,
          rawResponse: resBody,
          sessionId: this.sessionId
        };
      } else {
        return {
          success: false,
          toolName: name,
          arguments: args,
          isError: true,
          durationMs,
          rawResponse: resBody,
          sessionId: this.sessionId
        };
      }
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = err instanceof Error ? err.message : 'Network failure';

      const logEntry: NetworkLogEntry = {
        id: this.networkLogs.length + 1,
        timestamp: new Date().toISOString(),
        method: 'POST',
        url: `${this.baseUrl}/mcp (tools/call: ${name})`,
        requestHeaders: reqHeaders,
        requestBody: reqBody,
        responseStatus: 0,
        responseHeaders: {},
        responseBody: { error: errorMsg },
        durationMs
      };
      this.networkLogs.push(logEntry);
      this.notifyLog(logEntry);

      return {
        success: false,
        toolName: name,
        arguments: args,
        isError: true,
        durationMs,
        rawResponse: { error: errorMsg },
        sessionId: this.sessionId
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.sessionId) return;

    try {
      await fetch(`${this.baseUrl}/mcp`, {
        method: 'DELETE',
        headers: {
          'MCP-Session-Id': this.sessionId
        }
      });
    } catch {
      // Clean up locally even if network teardown fails
    } finally {
      this.sessionId = null;
      this.isConnected = false;
      this.availableTools = [];
    }
  }

  private notifyLog(entry: NetworkLogEntry): void {
    for (const cb of this.onLogCallbacks) {
      try {
        cb(entry);
      } catch {
        // Ignore listener exceptions
      }
    }
  }
}
