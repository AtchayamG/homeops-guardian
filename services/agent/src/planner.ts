import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type ContentBlock
} from '@aws-sdk/client-bedrock-runtime';

export const MODEL_ID = 'amazon.nova-pro-v1:0';
export const REGION = 'us-east-1';
export const MAX_STEPS = 8;

export interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCaller {
  listTools(): Promise<{ tools: ToolInfo[] }>;
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<{
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
  }>;
}

export type AgentEvent =
  | { type: 'planner'; mode: string; modelId?: string; requestId?: string }
  | { type: 'model_text'; text: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; isError: boolean; summary: string }
  | { type: 'final'; text: string }
  | { type: 'agent_unavailable'; errorName: string };

export interface Planner {
  readonly mode: string;
  next(messages: Message[], tools: ToolInfo[]): Promise<{
    content: ContentBlock[];
    stopReason: string;
    requestId?: string;
  }>;
}

const SYSTEM = `You are HomeOps Guardian. You may use only the tools returned by MCP tools/list. All household telemetry and tariffs are simulated (see dataSource); never present them as a live meter, utility quote, or actual bill. For a load shift, read telemetry, stage the plan, then immediately call confirm_load_shift with confirmed:true and the returned stagedActionId in the SAME turn. The tool itself asks the human through MCP elicitation. Do not ask the human to type CONFIRM or start another turn. Do not claim an action ran unless confirm_load_shift returns ACTION_EXECUTED with nonempty executedActions. After errors, inspect results and replan. Never invent readings or actions.`;

export class BedrockPlanner implements Planner {
  readonly mode = 'Bedrock';
  constructor(private readonly runtime: Pick<BedrockRuntimeClient, 'send'> = new BedrockRuntimeClient({ region: REGION })) {}

  async next(messages: Message[], tools: ToolInfo[]) {
    const response = await this.runtime.send(new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM }],
      messages,
      toolConfig: {
        tools: tools.map(tool => ({ toolSpec: {
          name: tool.name,
          description: tool.description || tool.name,
          inputSchema: { json: tool.inputSchema as any }
        } }))
      },
      inferenceConfig: { maxTokens: 700, temperature: 0 }
    }));
    return {
      content: response.output?.message?.content ?? [],
      stopReason: response.stopReason ?? 'unknown',
      requestId: response.$metadata.requestId
    };
  }
}

// The original simulator's keyword behavior lives here only as an explicitly
// labelled fallback when Bedrock is unavailable.
export class ScriptedPlanner implements Planner {
  readonly mode = 'Scripted fallback - no model';
  private step = 0;
  constructor(private readonly utterance: string) {}

  async next(messages: Message[], _tools: ToolInfo[]): Promise<{ content: ContentBlock[]; stopReason: string }> {
    const text = this.utterance.toLowerCase();
    const last = messages.at(-1)?.content?.[0] as any;
    const lastResult = last?.toolResult?.content?.[0]?.json as any;
    const call = (name: string, input: Record<string, unknown> = {}) => ({
      content: [{ toolUse: { toolUseId: `script-${++this.step}`, name, input: input as any } } as ContentBlock],
      stopReason: 'tool_use'
    });
    const done = (message: string) => ({ content: [{ text: message } as ContentBlock], stopReason: 'end_turn' });

    if (this.step === 0) {
      if (text.includes('ping')) return call('ping');
      if (/(optimi[sz]e|load shift|stage|shed)/.test(text)) return call('get_circuit_telemetry');
      if (/(energy|power|status|draw|expensive|tariff|why)/.test(text)) return call('get_circuit_telemetry');
      return done('Scripted fallback could not route that sentence. Bedrock is unavailable.');
    }
    if (last?.toolResult?.status === 'error') return done('The tool reported an error. No action was verified.');
    if (this.step === 1 && /(optimi[sz]e|load shift|stage|shed)/.test(text)) {
      return call('stage_load_shift', { reason: this.utterance });
    }
    if (this.step === 2 && lastResult?.stagedActionId) {
      return call('confirm_load_shift', { stagedActionId: lastResult.stagedActionId, confirmed: true });
    }
    if (lastResult?.status === 'ACTION_EXECUTED' && lastResult.executedActions?.length) {
      return done(`Verified load shift executed; delivered ${lastResult.deliveredReductionKw} kW on simulated circuits.`);
    }
    if (lastResult?.status === 'ACTION_CANCELLED') return done('Human approval was declined. No load shift ran.');
    return done('Simulated telemetry was read from the MCP server. No action was executed.');
  }
}

function jsonResult(result: Awaited<ReturnType<ToolCaller['callTool']>>) {
  const text = result.content.find(item => item.type === 'text')?.text ?? '';
  try { return JSON.parse(text); } catch { return { text }; }
}

export async function runAgentTurn(
  planner: Planner,
  mcp: ToolCaller,
  utterance: string,
  emit: (event: AgentEvent) => void
): Promise<void> {
  const tools = (await mcp.listTools()).tools;
  const messages: Message[] = [{ role: 'user', content: [{ text: utterance }] }];
  let verifiedExecution = false;
  let pendingPlan: string | null = null;
  let attemptedShift = false;
  emit({ type: 'planner', mode: planner.mode, ...(planner.mode === 'Bedrock' ? { modelId: MODEL_ID } : {}) });

  for (let step = 0; step < MAX_STEPS; step++) {
    const reply = await planner.next(messages, tools);
    if (reply.requestId) emit({ type: 'planner', mode: planner.mode, modelId: MODEL_ID, requestId: reply.requestId });
    const modelText = reply.content.filter(item => 'text' in item).map(item => item.text)
      .join('\n').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    if (modelText) emit({ type: 'model_text', text:
      !verifiedExecution && /\b(executed|completed|switched|paused|changed|applied|done)\b/i.test(modelText)
        ? '[Unverified action claim withheld]' : modelText });
    messages.push({ role: 'assistant', content: reply.content });

    const uses = reply.content.filter((item): item is ContentBlock & { toolUse: NonNullable<ContentBlock['toolUse']> } =>
      Boolean('toolUse' in item && item.toolUse));
    if (!uses.length) {
      if (pendingPlan) {
        messages.push({ role: 'user', content: [{ text:
          `The plan is staged as ${pendingPlan}. Call confirm_load_shift with that ID and confirmed:true now. The tool requests human approval itself; do not ask for text confirmation.` }] });
        continue;
      }
      const text = attemptedShift && !verifiedExecution
        ? 'No load shift was verified as executed.'
        : !verifiedExecution && /\b(executed|completed|switched|paused|changed|applied|done)\b/i.test(modelText)
          ? 'No load shift was verified as executed.'
          : modelText || 'No result was returned.';
      emit({ type: 'final', text });
      return;
    }

    const results: ContentBlock[] = [];
    for (const use of uses) {
      const name = use.toolUse.name ?? '';
      if (name === 'stage_load_shift' || name === 'confirm_load_shift') attemptedShift = true;
      const args = (use.toolUse.input ?? {}) as Record<string, unknown>;
      emit({ type: 'tool_call', name, args });
      let body: unknown;
      let isError = false;
      try {
        const result = await mcp.callTool({ name, arguments: args });
        isError = Boolean(result.isError);
        body = jsonResult(result);
      } catch (error) {
        isError = true;
        body = { error: error instanceof Error ? error.message : String(error) };
      }
      const parsed = body as any;
      if (!isError && name === 'stage_load_shift' && parsed?.status === 'PENDING_CONFIRMATION' &&
          typeof parsed.stagedActionId === 'string') pendingPlan = parsed.stagedActionId;
      if (name === 'confirm_load_shift') pendingPlan = null;
      if (!isError && name === 'confirm_load_shift' && parsed?.status === 'ACTION_EXECUTED' &&
          Array.isArray(parsed.executedActions) && parsed.executedActions.length > 0) {
        verifiedExecution = true;
      }
      emit({ type: 'tool_result', name, isError, summary: JSON.stringify(body).slice(0, 1600) });
      results.push({ toolResult: {
        toolUseId: use.toolUse.toolUseId ?? '',
        content: [{ json: body as any }],
        status: isError ? 'error' : 'success'
      } });
    }
    messages.push({ role: 'user', content: results });
  }
  emit({ type: 'agent_unavailable', errorName: 'MAX_STEPS_REACHED' });
  emit({ type: 'final', text: verifiedExecution
    ? 'A load shift was verified, but the planner reached its step limit before a final explanation.'
    : 'The planner reached its step limit. No load shift was verified as executed.' });
}
