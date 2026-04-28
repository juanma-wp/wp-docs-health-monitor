export type UserMessage      = { role: 'user'; text: string };
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
