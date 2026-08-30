/**
 * Agent Orchestration Loop
 * Manages multi-turn Groq tool-use execution with rate-limit handling.
 */

import Groq from 'groq-sdk';
import { TOOL_DEFINITIONS, dispatchTool } from '@/lib/tools';
import { buildSystemPrompt } from '@/lib/prompts';
import { ChatMessage } from '@/types/monday';

const MAX_TOOL_ROUNDS = 4;
// Token budget for tool results — keeps us under Groq's 8000 TPM limit
const MAX_TOOL_RESULT_CHARS = 1800;

export interface AgentResult {
  reply: string;
  dataQualityNotes: string[];
  toolsUsed: string[];
}

/**
 * Sleep helper for rate-limit backoff
 */
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Groq with automatic retry on 429 rate-limit errors.
 */
async function createWithRetry(
  client: Groq,
  params: Parameters<typeof client.chat.completions.create>[0],
  retries = 3
): Promise<Groq.Chat.ChatCompletion> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return (await client.chat.completions.create(params)) as Groq.Chat.ChatCompletion;
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const status = (errObj?.status as number) ?? (errObj?.code as number) ?? 0;
      const message = String((errObj as { message?: unknown })?.message ?? '');
      const isRateLimit = status === 429 || message.includes('rate_limit') || message.includes('Rate limit');

      if (isRateLimit && attempt < retries) {
        // Extract retry-after from message or default to 15s
        const match = message.match(/try again in ([0-9.]+)s/);
        const waitSeconds = match ? Math.ceil(parseFloat(match[1])) + 2 : 15;
        console.log(`[agent] Rate limited. Waiting ${waitSeconds}s before retry ${attempt + 1}/${retries}...`);
        await sleep(waitSeconds * 1000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Trim tool result content to stay within token budget.
 * Summarizes if the JSON is too long.
 */
function trimToolResult(rawContent: string): string {
  if (rawContent.length <= MAX_TOOL_RESULT_CHARS) return rawContent;

  // Try to parse and keep only the most important fields
  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>;
    // Keep top-level summary fields only; drop sample_records, raw items, etc.
    const slim: Record<string, unknown> = {};
    const priorityKeys = [
      'board_type', 'board_name', 'total_records_fetched', 'records_after_filter',
      'aggregation', 'data_quality', 'pipeline', 'revenue', 'operations',
      'crossBoardInsights', 'overallDataQualityScore', 'reportDate',
      'timePeriodContext', 'totalDealsRecords', 'totalWorkOrderRecords', 'columns',
    ];
    for (const key of priorityKeys) {
      if (key in parsed) slim[key] = parsed[key];
    }
    const slimStr = JSON.stringify(slim, null, 0);
    if (slimStr.length <= MAX_TOOL_RESULT_CHARS) return slimStr;
    // Still too long — truncate with note
    return slimStr.slice(0, MAX_TOOL_RESULT_CHARS) + '... [truncated for brevity]';
  } catch {
    return rawContent.slice(0, MAX_TOOL_RESULT_CHARS) + '... [truncated]';
  }
}

const PRIMARY_MODELS = ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-120b'];

export async function runAgent(messages: ChatMessage[]): Promise<AgentResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured. Please set it in .env.local.');
  }

  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Convert chat history to Groq message format
  const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
    } as Groq.Chat.ChatCompletionMessageParam)),
  ];

  const allDataQualityNotes: string[] = [];
  const toolsUsed: string[] = [];
  let currentMessages = [...groqMessages];

  let selectedModel = PRIMARY_MODELS[0];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Force tool calling on round 0
    const toolChoice = toolsUsed.length === 0 ? 'required' : 'auto';

    let response: Groq.Chat.ChatCompletion;
    try {
      response = await createWithRetry(client, {
        model: selectedModel,
        messages: currentMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: toolChoice,
        max_completion_tokens: 1200,
      });
    } catch (err: unknown) {
      const errMsg = String((err as Record<string, unknown>)?.message ?? err);
      // If daily limit reached on primary model, fallback to alternative
      if (errMsg.includes('Tokens per day') || errMsg.includes('TPD')) {
        for (const fallback of PRIMARY_MODELS) {
          if (fallback !== selectedModel) {
            try {
              console.log(`[agent] Swapping to fallback model ${fallback}...`);
              selectedModel = fallback;
              response = await createWithRetry(client, {
                model: fallback,
                messages: currentMessages,
                tools: TOOL_DEFINITIONS,
                tool_choice: toolChoice,
                max_completion_tokens: 1200,
              });
              break;
            } catch {
              continue;
            }
          }
        }
      }
      if (!response!) throw err;
    }

    const choice = response.choices[0];
    const message = choice.message;
    const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;

    // Model returned a text response
    if (!hasToolCalls) {
      const msgObj = message as unknown as Record<string, unknown>;
      const content =
        (typeof message.content === 'string' && message.content ? message.content : null) ??
        (msgObj.reasoning as string | undefined) ??
        '';

      // If the model output looks like planning or internal monologue after tools, nudge it to output the final report
      const isInternalMonologue =
        toolsUsed.length > 0 &&
        round < MAX_TOOL_ROUNDS &&
        (content.length < 150 ||
          /^(so |let's |we need |we'll |approach:|first,|perhaps |now get)/i.test(content.trim()));

      if (isInternalMonologue) {
        currentMessages.push(message);
        currentMessages.push({
          role: 'user',
          content: 'Please present the final executive briefing with clear Markdown tables, totals, and business insights based on the retrieved data.',
        });
        continue;
      }

      return {
        reply: content || 'Analysis complete. Please try asking a more specific question.',
        dataQualityNotes: deduplicateNotes(allDataQualityNotes),
        toolsUsed,
      };
    }

    // Push assistant message with tool calls
    currentMessages.push(message);

    // Execute all tool calls sequentially (not in parallel) to control token usage
    for (const toolCall of message.tool_calls ?? []) {
      const toolName = toolCall.function.name;
      toolsUsed.push(toolName);

      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        // Use empty args — dispatcher will handle gracefully
      }

      const result = await dispatchTool(toolName, parsedArgs);

      if (result.dataQualityNotes?.length) {
        allDataQualityNotes.push(...result.dataQualityNotes);
      }

      const rawContent = JSON.stringify(result.output, null, 0);
      const trimmedContent = trimToolResult(rawContent);

      currentMessages.push({
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: trimmedContent,
      });

      // Small pause between tool calls to reduce TPM burst
      await sleep(300);
    }
  }

  // Exhausted rounds — return last assistant text
  for (let i = currentMessages.length - 1; i >= 0; i--) {
    const msg = currentMessages[i];
    if (msg.role === 'assistant') {
      const msgObj = msg as unknown as Record<string, unknown>;
      const text =
        (typeof msg.content === 'string' && msg.content ? msg.content : null) ??
        (msgObj.reasoning as string | undefined);
      if (text) {
        return {
          reply: text,
          dataQualityNotes: deduplicateNotes(allDataQualityNotes),
          toolsUsed,
        };
      }
    }
  }

  return {
    reply: 'Analysis complete from Monday.com boards.',
    dataQualityNotes: deduplicateNotes(allDataQualityNotes),
    toolsUsed,
  };
}

function deduplicateNotes(notes: string[]): string[] {
  return [...new Set(notes)].slice(0, 20);
}
