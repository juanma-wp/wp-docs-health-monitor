import Anthropic from '@anthropic-ai/sdk';

import type { LLMClient, ChatMessage, ToolDef, ToolChoice, ChatResponse, AssistantMessage } from './llm-client.js';

export type CostAccumulator = {
  inputTokens:         number;
  outputTokens:        number;
  cacheReadTokens:     number;
  cacheCreationTokens: number;
};

export class AnthropicLLMClient implements LLMClient {
  private readonly anthropic: Anthropic;
  readonly costAccumulator: CostAccumulator = {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
  };

  constructor(anthropic: Anthropic) {
    this.anthropic = anthropic;
  }

  async chat(
    model:        string,
    systemPrompt: string,
    messages:     ChatMessage[],
    tools:        ToolDef[],
    toolChoice:   ToolChoice,
    maxTokens:    number,
  ): Promise<ChatResponse> {
    const anthropicMessages = this.toAnthropicMessages(messages);
    const anthropicTools: Anthropic.Tool[] = tools.map(t => ({
      name:         t.name,
      description:  t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));
    const anthropicChoice: Anthropic.MessageCreateParamsNonStreaming['tool_choice'] =
      toolChoice.type === 'any'
        ? { type: 'any' }
        : { type: 'tool', name: toolChoice.name };

    const response = await this.anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: [
        {
          type:          'text',
          text:          systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages:    anthropicMessages,
      tools:       anthropicTools,
      tool_choice: anthropicChoice,
    });

    this.costAccumulator.inputTokens         += response.usage.input_tokens;
    this.costAccumulator.outputTokens        += response.usage.output_tokens;
    this.costAccumulator.cacheReadTokens     += response.usage.cache_read_input_tokens    ?? 0;
    this.costAccumulator.cacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0;

    const toolCalls = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input }));

    const stopReason: ChatResponse['stopReason'] =
      response.stop_reason === 'tool_use'  ? 'tool_use'
      : response.stop_reason === 'end_turn' ? 'end_turn'
      : 'other';

    const appendMessage: AssistantMessage = {
      role:      'assistant',
      toolCalls,
      _raw:      response.content,
    };

    return {
      toolCalls,
      appendMessage,
      stopReason,
      usage: {
        inputTokens:      response.usage.input_tokens,
        outputTokens:     response.usage.output_tokens,
        cacheReadTokens:  response.usage.cache_read_input_tokens    ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  }

  private toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    return messages.map((msg, idx): Anthropic.MessageParam => {
      if (msg.role === 'user') {
        // Cache the first user message (the large doc+code context block)
        const content = idx === 0
          ? [{ type: 'text' as const, text: msg.text, cache_control: { type: 'ephemeral' as const } }]
          : [{ type: 'text' as const, text: msg.text }];
        return { role: 'user', content };
      }

      if (msg.role === 'assistant') {
        // _raw holds the original Anthropic content blocks (text + tool_use)
        return { role: 'assistant', content: msg._raw as Anthropic.ContentBlock[] };
      }

      // tool_result — sent as user turn in Anthropic's protocol
      return {
        role: 'user',
        content: msg.results.map(r => ({
          type:        'tool_result' as const,
          tool_use_id: r.id,
          content:     r.content,
        })),
      };
    });
  }
}
