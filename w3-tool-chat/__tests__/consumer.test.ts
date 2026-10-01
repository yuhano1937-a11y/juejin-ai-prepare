/**
 * @file consumer.test.ts
 * @description createStreamConsumer 综合端到端测试：文本消费、攒批优化、生命周期、主动中断与注册表别名分发
 */

import { describe, it, expect, vi } from 'vitest';
import { createStreamConsumer, registerProviderProtocol } from '../lib/stream-parser/index';
import { createMockStream } from './helpers/mock-stream';
import type { ToolCallDelta, TokenUsage } from '../lib/stream-parser/core/types';

describe('createStreamConsumer (端到端消费客户端)', () => {
  it('端到端消费 OpenAI 文本流并正常触发生命周期回调', async () => {
    const stream = createMockStream([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const tokens: string[] = [];
    const onDone = vi.fn();

    const consumer = createStreamConsumer(stream, {
      provider: 'openai',
      onToken: (t) => tokens.push(t),
      onDone,
    });

    await consumer.done;

    expect(tokens).toEqual(['Hello', ' World']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('支持根据 batchStrategy (interval) 进行平滑攒批输出', async () => {
    const stream = createMockStream([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"C"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"D"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const batches: string[] = [];
    const consumer = createStreamConsumer(stream, {
      provider: 'openai',
      batchStrategy: { intervalMs: 50 },
      onToken: (batch) => batches.push(batch),
    });

    await consumer.done;

    const combined = batches.join('');
    expect(combined).toBe('ABCD');
    expect(batches.length).toBeLessThanOrEqual(2);
  });

  it('正确分发工具调用和 Usage 统计', async () => {
    const stream = createMockStream([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"calc"}}]}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}\n\n',
      'data: [DONE]\n\n',
    ]);

    const toolCalls: ToolCallDelta[] = [];
    let receivedUsage: TokenUsage | undefined;

    const consumer = createStreamConsumer(stream, {
      provider: 'openai',
      onToolCall: (tc) => toolCalls.push(tc),
      onUsage: (u) => { receivedUsage = u; },
    });

    await consumer.done;

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('calc');
    expect(receivedUsage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it('主动调用 abort() 时立即中断后续消费', async () => {
    const stream = createMockStream([
      'data: {"choices":[{"delta":{"content":"1"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"2"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"3"}}]}\n\n',
    ], { delayMs: 20 });

    const tokens: string[] = [];
    const consumer = createStreamConsumer(stream, {
      provider: 'openai',
      onToken: (t) => {
        tokens.push(t);
        if (tokens.length === 1) {
          consumer.abort();
        }
      },
    });

    await consumer.done;
    expect(tokens).toEqual(['1']);
  });

  it('支持传入火山引擎、硅基流动、Groq 等主流高频别名', async () => {
    const stream = createMockStream([
      'data: {"choices":[{"delta":{"content":"火山方舟"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const tokens: string[] = [];
    const consumer = createStreamConsumer(stream, {
      provider: 'volcengine',
      onToken: (t) => tokens.push(t),
    });

    await consumer.done;
    expect(tokens).toEqual(['火山方舟']);
  });

  it('支持通过 registerProviderProtocol 动态注册自研网关别名', async () => {
    registerProviderProtocol('internal-llm-proxy', 'openai');

    const stream = createMockStream([
      'data: {"choices":[{"delta":{"content":"自研网关数据"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const tokens: string[] = [];
    const consumer = createStreamConsumer(stream, {
      provider: 'internal-llm-proxy',
      onToken: (t) => tokens.push(t),
    });

    await consumer.done;
    expect(tokens).toEqual(['自研网关数据']);
  });

  it('传入未知且未注册的 provider 时抛出友好详尽的错误提示', () => {
    const stream = createMockStream([]);
    expect(() => {
      createStreamConsumer(stream, { provider: 'unknown-vendor-xyz' });
    }).toThrow(/Unknown provider: "unknown-vendor-xyz"/);
  });
});
