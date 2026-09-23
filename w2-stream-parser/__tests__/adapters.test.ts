/**
 * @file adapters.test.ts
 * @description 厂商适配器单元测试：OpenAI/DeepSeek、Claude、通义千问协议兼容性与 4 大暗坑容错验证
 */

import { describe, it, expect } from 'vitest';
import { OpenAIAdapter } from '../lib/stream-parser/adapters/openai';
import { ClaudeAdapter } from '../lib/stream-parser/adapters/claude';
import type { SSEEvent } from '../lib/stream-parser/core/types';

describe('Provider Adapters', () => {
  describe('OpenAIAdapter (兼容 DeepSeek / Kimi / 豆包 等)', () => {
    const adapter = new OpenAIAdapter();

    it('正确解析普通文本 delta', () => {
      const event: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [{ index: 0, delta: { content: '你好，大模型' } }],
        }),
      };
      expect(adapter.extractTextDelta(event)).toBe('你好，大模型');
      expect(adapter.isStreamEnd(event)).toBe(false);
    });

    it('正确识别 [DONE] 结束标记', () => {
      const event: SSEEvent = { event: 'message', data: '[DONE]' };
      expect(adapter.isStreamEnd(event)).toBe(true);
      expect(adapter.extractTextDelta(event)).toBeNull();
    });

    it('正确提取流式 Tool Calls 分片', () => {
      const event: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_123',
                    function: { name: 'getWeather', arguments: '{"city":' },
                  },
                ],
              },
            },
          ],
        }),
      };
      const toolDelta = adapter.extractToolCallDelta(event);
      expect(toolDelta).toEqual({
        index: 0,
        id: 'call_123',
        name: 'getWeather',
        arguments: '{"city":',
      });
    });

    it('正确提取 Usage 统计指标', () => {
      const event: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 15, completion_tokens: 30, total_tokens: 45 },
        }),
      };
      expect(adapter.extractUsage(event)).toEqual({
        promptTokens: 15,
        completionTokens: 30,
        totalTokens: 45,
      });
    });

    it('防御暗坑一：厂商缺失 [DONE] 时，依靠 finish_reason (stop/length/tool_calls) 正常终结', () => {
      const stopEvent: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        }),
      };
      expect(adapter.isStreamEnd(stopEvent)).toBe(true);

      const lengthEvent: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
        }),
      };
      expect(adapter.isStreamEnd(lengthEvent)).toBe(true);
    });

    it('防御暗坑二：处理 content 为 null、undefined 或空字符串时绝不崩溃', () => {
      const nullEvent: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [{ index: 0, delta: { content: null } }],
        }),
      };
      expect(adapter.extractTextDelta(nullEvent)).toBeNull();

      const emptyEvent: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [{ index: 0, delta: { content: '' } }],
        }),
      };
      expect(adapter.extractTextDelta(emptyEvent)).toBeNull();
    });

    it('扩展支持：正确提取 DeepSeek R1 / Kimi 的思维链 reasoning_content', () => {
      const reasoningEvent: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [{ index: 0, delta: { content: null, reasoning_content: '正在推导公式...' } }],
        }),
      };
      expect(adapter.extractTextDelta(reasoningEvent)).toBeNull();
      expect(adapter.extractReasoningDelta(reasoningEvent)).toBe('正在推导公式...');
    });

    it('防御暗坑三：兼容国内厂商将 usage 注入在最后一个 choice 且使用 input_tokens 别名', () => {
      const lastChunkWithUsage: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          choices: [{ index: 0, delta: { content: '。' }, finish_reason: 'stop' }],
          usage: { input_tokens: 25, output_tokens: 50 },
        }),
      };
      expect(adapter.extractTextDelta(lastChunkWithUsage)).toBe('。');
      expect(adapter.isStreamEnd(lastChunkWithUsage)).toBe(true);
      expect(adapter.extractUsage(lastChunkWithUsage)).toEqual({
        promptTokens: 25,
        completionTokens: 50,
        totalTokens: 75,
      });
    });
  });

  describe('ClaudeAdapter (Anthropic 规范)', () => {
    const adapter = new ClaudeAdapter();

    it('基于 content_block_delta 提取文本 delta', () => {
      const event: SSEEvent = {
        event: 'content_block_delta',
        data: JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Claude 回复' },
        }),
      };
      expect(adapter.extractTextDelta(event)).toBe('Claude 回复');
    });

    it('基于 message_stop 识别流结束', () => {
      const event: SSEEvent = { event: 'message_stop', data: '{}' };
      expect(adapter.isStreamEnd(event)).toBe(true);
    });

    it('基于 content_block_start 与 delta 提取 Tool Calls', () => {
      const startEvent: SSEEvent = {
        event: 'content_block_start',
        data: JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tool_01', name: 'search' },
        }),
      };
      expect(adapter.extractToolCallDelta(startEvent)).toEqual({
        index: 0,
        id: 'tool_01',
        name: 'search',
        arguments: '',
      });

      const deltaEvent: SSEEvent = {
        event: 'content_block_delta',
        data: JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"query":"ts"}' },
        }),
      };
      expect(adapter.extractToolCallDelta(deltaEvent)).toEqual({
        index: 0,
        arguments: '{"query":"ts"}',
      });
    });

    it('从 message_start 与 message_delta 提取 usage', () => {
      const startEvt: SSEEvent = {
        event: 'message_start',
        data: JSON.stringify({ message: { usage: { input_tokens: 20 } } }),
      };
      expect(adapter.extractUsage(startEvt)).toEqual({
        promptTokens: 20,
        completionTokens: 0,
        totalTokens: 20,
      });

      const deltaEvt: SSEEvent = {
        event: 'message_delta',
        data: JSON.stringify({ usage: { output_tokens: 50 } }),
      };
      expect(adapter.extractUsage(deltaEvt)).toEqual({
        promptTokens: 0,
        completionTokens: 50,
        totalTokens: 50,
      });
    });
  });

  describe('OpenAI 兼容生态验证 (以阿里云通义千问 /compatible-mode/v1 为例)', () => {
    it('兼容模式 (/compatible-mode/v1)：标准 OpenAIAdapter 正确解析 choices[0].delta 增量文本', () => {
      const adapter = new OpenAIAdapter();
      const event: SSEEvent = {
        event: 'message',
        data: JSON.stringify({
          id: 'chatcmpl-qwen-123',
          choices: [{ index: 0, delta: { content: '你' }, finish_reason: null }],
        }),
      };
      expect(adapter.extractTextDelta(event)).toBe('你');
      expect(adapter.isStreamEnd(event)).toBe(false);
    });
  });
});
