import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { OllamaLLMClient } from '../ollama-client.js';
import type { ChatMessage, ToolDef } from '../llm-client.js';

const TOOL: ToolDef = {
  name:        'report_findings',
  description: 'Report drift findings',
  parameters:  { type: 'object', properties: {} },
};

function mockFetchOnce(body: object, ok = true, status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    status,
    text: async () => 'error body',
    json: async () => body,
  })));
}

function makeOllamaResponse(toolCalls: Array<{ id: string; name: string; args: string }>, content: string | null = null) {
  return {
    choices: [{
      message: {
        role:    'assistant',
        content,
        tool_calls: toolCalls.map(tc => ({
          id:       tc.id,
          type:     'function' as const,
          function: { name: tc.name, arguments: tc.args },
        })),
      },
      finish_reason: 'tool_calls',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

describe('OllamaLLMClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // parseArguments — exercised via tool_calls.function.arguments
  // -------------------------------------------------------------------------

  describe('parseArguments behaviour (via chat)', () => {
    it('parses valid JSON arguments into a structured object', async () => {
      mockFetchOnce(makeOllamaResponse([
        { id: 'tc_1', name: 'report_findings', args: '{"issues":[],"positives":["ok"]}' },
      ]));

      const client = new OllamaLLMClient('http://localhost:11434/v1');
      const res = await client.chat('m', 'sys', [{ role: 'user', text: 'hi' }], [TOOL], { type: 'any' }, 1024);

      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls[0].input).toEqual({ issues: [], positives: ['ok'] });
    });

    it('returns {} and warns when arguments are malformed JSON', async () => {
      mockFetchOnce(makeOllamaResponse([
        { id: 'tc_1', name: 'report_findings', args: '{not valid json' },
      ]));

      const client = new OllamaLLMClient('http://localhost:11434/v1');
      const res = await client.chat('m', 'sys', [{ role: 'user', text: 'hi' }], [TOOL], { type: 'any' }, 1024);

      expect(res.toolCalls[0].input).toEqual({});
      expect(console.warn).toHaveBeenCalledTimes(1);
      const warnArg = (console.warn as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
      expect(warnArg).toContain('[ollama-client]');
      expect(warnArg).toContain('{not valid json');
    });

    it('returns {} and warns when arguments are an empty string', async () => {
      mockFetchOnce(makeOllamaResponse([
        { id: 'tc_1', name: 'report_findings', args: '' },
      ]));

      const client = new OllamaLLMClient('http://localhost:11434/v1');
      const res = await client.chat('m', 'sys', [{ role: 'user', text: 'hi' }], [TOOL], { type: 'any' }, 1024);

      expect(res.toolCalls[0].input).toEqual({});
      expect(console.warn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // stripThinkTokens — exercised via a second-turn assistant replay
  // -------------------------------------------------------------------------

  describe('stripThinkTokens behaviour (via assistant replay)', () => {
    async function captureAssistantContentAfterReplay(content: string | null): Promise<string | null | undefined> {
      const fetchMock = vi.fn(async () => ({
        ok:     true,
        status: 200,
        text:   async () => '',
        json:   async () => makeOllamaResponse([
          { id: 'tc_2', name: 'report_findings', args: '{}' },
        ]),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const client = new OllamaLLMClient('http://localhost:11434/v1');
      const messages: ChatMessage[] = [
        { role: 'user', text: 'hi' },
        // Replay an earlier assistant turn whose _raw content includes think blocks.
        { role: 'assistant', toolCalls: [], _raw: { content, tool_calls: [] } },
      ];
      await client.chat('m', 'sys', messages, [TOOL], { type: 'any' }, 1024);

      const callArgs = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
      const body = JSON.parse(callArgs[1].body) as {
        messages: Array<{ role: string; content: string | null }>;
      };
      const assistantMsg = body.messages.find(m => m.role === 'assistant');
      return assistantMsg?.content;
    }

    it('strips a single <think>...</think> block from replayed assistant content', async () => {
      const result = await captureAssistantContentAfterReplay('<think>internal reasoning</think>final answer');
      expect(result).toBe('final answer');
    });

    it('strips multiple <think> blocks across the same content', async () => {
      const result = await captureAssistantContentAfterReplay('<think>a</think>between<think>b</think>after');
      expect(result).toBe('betweenafter');
    });

    it('leaves content unchanged when no <think> blocks are present', async () => {
      const result = await captureAssistantContentAfterReplay('plain assistant text');
      expect(result).toBe('plain assistant text');
    });

    it('passes through null content (no tool calls were emitted)', async () => {
      const result = await captureAssistantContentAfterReplay(null);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // HTTP error branch
  // -------------------------------------------------------------------------

  describe('HTTP error handling', () => {
    it('throws an Error containing the status when res.ok is false', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok:     false,
        status: 503,
        text:   async () => 'service unavailable',
        json:   async () => ({}),
      })));

      const client = new OllamaLLMClient('http://localhost:11434/v1');
      await expect(
        client.chat('m', 'sys', [{ role: 'user', text: 'hi' }], [TOOL], { type: 'any' }, 1024),
      ).rejects.toThrow(/Ollama request failed \(503\): service unavailable/);
    });
  });
});
