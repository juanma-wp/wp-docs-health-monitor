export type UserMessage      = { role: 'user'; text: string };
// `_raw` is provider-specific assistant turn state. It must only be interpreted
// by the LLMClient that produced it (the format differs per provider — e.g.
// Anthropic.ContentBlock[] vs. { content, tool_calls } for Ollama). Treat it
// as opaque outside the originating client.
export type AssistantMessage = { role: 'assistant'; toolCalls: ToolCall[]; _raw: unknown };
export type ToolResultMessage = { role: 'tool_result'; results: Array<{ id: string; content: string }> };
export type ChatMessage = UserMessage | AssistantMessage | ToolResultMessage;

export type ToolCall = { id: string; name: string; input: unknown };

export type ToolDef = {
  name:        string;
  description: string;
  parameters:  object;
};

export type ToolChoice = { type: 'any' } | { type: 'tool'; name: string };

export type LLMUsage = {
  inputTokens:        number;
  outputTokens:       number;
  cacheReadTokens?:   number;
  cacheWriteTokens?:  number;
};

export type ChatResponse = {
  toolCalls:     ToolCall[];
  appendMessage: AssistantMessage;
  stopReason:    'tool_use' | 'end_turn' | 'other';
  usage:         LLMUsage;
};

// Per-run aggregate of token usage across calls. Field names mirror
// Anthropic's pricing dimensions; non-Anthropic providers leave the cache
// fields at 0.
export type CostAccumulator = {
  inputTokens:         number;
  outputTokens:        number;
  cacheReadTokens:     number;
  cacheCreationTokens: number;
};

export interface LLMClient {
  chat(
    model:        string,
    systemPrompt: string,
    messages:     ChatMessage[],
    tools:        ToolDef[],
    toolChoice:   ToolChoice,
    maxTokens:    number,
  ): Promise<ChatResponse>;
}
