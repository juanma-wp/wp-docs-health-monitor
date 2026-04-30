import type { LLMClient, ChatMessage, ToolDef, ToolChoice, ChatResponse, AssistantMessage, ToolCall } from './llm-client.js';

// ---------------------------------------------------------------------------
// Ollama OpenAI-compatible API types (minimal surface)
// ---------------------------------------------------------------------------

type OllamaMessage =
  | { role: 'system';    content: string }
  | { role: 'user';      content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OllamaToolCall[] }
  | { role: 'tool';      tool_call_id: string; content: string };

type OllamaToolCall = {
  id:       string;
  type:     'function';
  function: { name: string; arguments: string };
};

type OllamaToolDef = {
  type:     'function';
  function: { name: string; description: string; parameters: object };
};

type OllamaToolChoice =
  | 'required'
  | { type: 'function'; function: { name: string } };

type OllamaResponse = {
  choices: Array<{
    message: {
      role:        string;
      content:     string | null;
      tool_calls?: OllamaToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens:     number;
    completion_tokens: number;
  };
};

// ---------------------------------------------------------------------------
// OllamaLLMClient
// ---------------------------------------------------------------------------

export class OllamaLLMClient implements LLMClient {
  private readonly baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434/v1') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async chat(
    model:        string,
    systemPrompt: string,
    messages:     ChatMessage[],
    tools:        ToolDef[],
    toolChoice:   ToolChoice,
    maxTokens:    number,
  ): Promise<ChatResponse> {
    const ollamaMessages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.toOllamaMessages(messages),
    ];

    const ollamaTools: OllamaToolDef[] = tools.map(t => ({
      type:     'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const ollamaChoice: OllamaToolChoice =
      toolChoice.type === 'any'
        ? 'required'
        : { type: 'function', function: { name: toolChoice.name } };

    const body = {
      model,
      messages:    ollamaMessages,
      tools:       ollamaTools,
      tool_choice: ollamaChoice,
      max_tokens:  maxTokens,
    };

    const startedAt = Date.now();
    console.log(`[ollama] ${model} → request (${ollamaMessages.length} msg · ${ollamaTools.length} tool(s) · max ${maxTokens})`);

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.log(`[ollama] ${model} ← HTTP ${res.status} after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      throw new Error(`Ollama request failed (${res.status}): ${text}`);
    }

    const data = await res.json() as OllamaResponse;
    const choice = data.choices[0];
    if (!choice) {
      console.log(`[ollama] ${model} ← empty response after ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      throw new Error('Ollama returned no choices');
    }
    console.log(
      `[ollama] ${model} ← ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${data.usage?.prompt_tokens ?? 0} prompt / ${data.usage?.completion_tokens ?? 0} completion · finish: ${choice.finish_reason}`,
    );

    const rawToolCalls = choice.message.tool_calls ?? [];
    const toolCalls: ToolCall[] = rawToolCalls.map(tc => ({
      id:    tc.id,
      name:  tc.function.name,
      input: this.parseArguments(tc.function.arguments),
    }));

    const stopReason: ChatResponse['stopReason'] =
      choice.finish_reason === 'tool_calls' ? 'tool_use'
      : choice.finish_reason === 'stop'      ? 'end_turn'
      : 'other';

    const appendMessage: AssistantMessage = {
      role:      'assistant',
      toolCalls,
      _raw: {
        content:     choice.message.content,
        tool_calls:  rawToolCalls,
      },
    };

    return {
      toolCalls,
      appendMessage,
      stopReason,
      usage: {
        inputTokens:  data.usage?.prompt_tokens     ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  private toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
    const result: OllamaMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.text });
        continue;
      }

      if (msg.role === 'assistant') {
        const raw = msg._raw as { content: string | null; tool_calls?: OllamaToolCall[] };
        result.push({
          role:       'assistant',
          content:    raw.content ? this.stripThinkTokens(raw.content) : null,
          tool_calls: raw.tool_calls,
        });
        continue;
      }

      // tool_result — one message per result in OpenAI protocol
      for (const r of msg.results) {
        result.push({ role: 'tool', tool_call_id: r.id, content: r.content });
      }
    }
    return result;
  }

  // Qwen3 models emit <think>...</think> blocks; strip them to keep output clean.
  private stripThinkTokens(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  private parseArguments(args: string): unknown {
    try {
      return JSON.parse(args);
    } catch (err) {
      console.warn(`[ollama-client] Failed to parse tool_call.function.arguments as JSON: ${String(err)} — raw: ${args}`);
      return {};
    }
  }
}
