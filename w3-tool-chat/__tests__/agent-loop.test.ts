import { describe, it, expect, vi } from 'vitest';
import { createAgentLoop } from '../lib/agent/agent-loop';
import { calculatorTool } from '../lib/agent/tools/calculator';
import { weatherTool } from '../lib/agent/tools/weather';
import type { AgentMessage, CallLLMFunction, AssembledToolCall } from '../lib/agent/types';

/**
 * 创建模拟 LLM 函数，按顺序返回预设的响应
 */
function createMockLLM(
  responses: Array<{
    content: string | null;
    tool_calls: AssembledToolCall[] | null;
    finish_reason: string;
  }>
): CallLLMFunction {
  let callIndex = 0;
  return async () => {
    if (callIndex >= responses.length) {
      throw new Error('Mock LLM 调用次数超出预设');
    }
    return responses[callIndex++];
  };
}

describe('AgentLoop', () => {
  it('AL1: 纯文本回答 - 无工具调用直接返回', async () => {
    const mockLLM = createMockLLM([
      { content: '你好！', tool_calls: null, finish_reason: 'stop' },
    ]);

    const result = await createAgentLoop({
      messages: [{ role: 'user', content: '你好' }],
      tools: [calculatorTool],
      callLLM: mockLLM,
    });

    expect(result.finalContent).toBe('你好！');
    expect(result.totalSteps).toBe(1);
  });

  it('AL2: 单轮单工具调用 - 完整执行循环', async () => {
    const mockLLM = createMockLLM([
      // 第 1 轮：LLM 决定调用 calculate
      {
        content: null,
        tool_calls: [
          { id: 'call_1', name: 'calculate', arguments: '{"expression":"2 + 3"}' },
        ],
        finish_reason: 'tool_calls',
      },
      // 第 2 轮：LLM 看到工具结果后给出最终回答
      {
        content: '2 + 3 的结果是 5',
        tool_calls: null,
        finish_reason: 'stop',
      },
    ]);

    const result = await createAgentLoop({
      messages: [{ role: 'user', content: '计算 2+3' }],
      tools: [calculatorTool],
      callLLM: mockLLM,
    });

    expect(result.finalContent).toBe('2 + 3 的结果是 5');
    expect(result.totalSteps).toBe(2);
    // 验证消息历史包含工具调用和结果
    const toolMessages = result.messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(1);
  });

  it('AL3: 单轮并行双工具调用', async () => {
    const toolCallStartNames: string[] = [];
    const toolCallEndNames: string[] = [];

    const mockLLM = createMockLLM([
      // 第 1 轮：LLM 同时调用两个工具
      {
        content: null,
        tool_calls: [
          { id: 'call_a', name: 'calculate', arguments: '{"expression":"10 * 20"}' },
          { id: 'call_b', name: 'get_weather', arguments: '{"city":"北京"}' },
        ],
        finish_reason: 'tool_calls',
      },
      // 第 2 轮：汇总结果
      {
        content: '10×20=200，北京天气已查询',
        tool_calls: null,
        finish_reason: 'stop',
      },
    ]);

    const result = await createAgentLoop({
      messages: [{ role: 'user', content: '算 10*20 并查北京天气' }],
      tools: [calculatorTool, weatherTool],
      callLLM: mockLLM,
      onToolCallStart: (name) => toolCallStartNames.push(name),
      onToolCallEnd: (name) => toolCallEndNames.push(name),
    });

    expect(result.totalSteps).toBe(2);
    // 两个工具都应该被调用
    expect(toolCallStartNames).toContain('calculate');
    expect(toolCallStartNames).toContain('get_weather');
    expect(toolCallEndNames).toHaveLength(2);
    // 消息历史应包含 2 条 tool 结果
    const toolMessages = result.messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(2);
  });

  it('AL4: 多轮递进调用 - 第一轮结果作为第二轮上下文', async () => {
    const mockLLM = createMockLLM([
      // 第 1 轮：先查天气
      {
        content: null,
        tool_calls: [
          { id: 'call_1', name: 'get_weather', arguments: '{"city":"上海"}' },
        ],
        finish_reason: 'tool_calls',
      },
      // 第 2 轮：根据天气结果做计算
      {
        content: null,
        tool_calls: [
          { id: 'call_2', name: 'calculate', arguments: '{"expression":"25 * 1.8 + 32"}' },
        ],
        finish_reason: 'tool_calls',
      },
      // 第 3 轮：最终回答
      {
        content: '上海气温 25°C，换算为华氏约 77°F',
        tool_calls: null,
        finish_reason: 'stop',
      },
    ]);

    const result = await createAgentLoop({
      messages: [{ role: 'user', content: '查上海天气并把温度换算成华氏度' }],
      tools: [calculatorTool, weatherTool],
      callLLM: mockLLM,
    });

    expect(result.totalSteps).toBe(3);
    expect(result.finalContent).toContain('77°F');
  });

  it('AL5: 未注册工具名 - 错误回传给 LLM', async () => {
    const mockLLM = createMockLLM([
      // LLM 调用了一个不存在的工具
      {
        content: null,
        tool_calls: [
          { id: 'call_x', name: 'nonexistent_tool', arguments: '{}' },
        ],
        finish_reason: 'tool_calls',
      },
      // LLM 看到错误后自省回答
      {
        content: '抱歉，该工具不存在',
        tool_calls: null,
        finish_reason: 'stop',
      },
    ]);

    const result = await createAgentLoop({
      messages: [{ role: 'user', content: '调用不存在的工具' }],
      tools: [calculatorTool],
      callLLM: mockLLM,
    });

    // 工具错误不应中断循环
    expect(result.finalContent).toBe('抱歉，该工具不存在');
    // tool 消息应包含错误信息
    const toolMsg = result.messages.find((m) => m.role === 'tool') as any;
    expect(toolMsg).toBeDefined();
    expect(JSON.parse(toolMsg.content).error).toContain('not found');
  });

  it('AL6: maxSteps 超限保护 - 防止死循环', async () => {
    // 永远返回工具调用，模拟死循环
    const mockLLM: CallLLMFunction = async () => ({
      content: null,
      tool_calls: [{ id: 'call_inf', name: 'calculate', arguments: '{"expression":"1+1"}' }],
      finish_reason: 'tool_calls',
    });

    await expect(
      createAgentLoop({
        messages: [{ role: 'user', content: '无限循环' }],
        tools: [calculatorTool],
        callLLM: mockLLM,
        maxSteps: 3,
      })
    ).rejects.toThrow(/max steps/i);
  });

  it('AL7: AbortSignal 中途取消', async () => {
    const ac = new AbortController();
    let callCount = 0;

    const mockLLM: CallLLMFunction = async () => {
      callCount++;
      if (callCount === 1) {
        // 第一轮返回工具调用，然后在工具执行期间 abort
        ac.abort();
        return {
          content: null,
          tool_calls: [{ id: 'call_1', name: 'calculate', arguments: '{"expression":"1"}' }],
          finish_reason: 'tool_calls',
        };
      }
      return { content: '完成', tool_calls: null, finish_reason: 'stop' };
    };

    await expect(
      createAgentLoop({
        messages: [{ role: 'user', content: '取消测试' }],
        tools: [calculatorTool],
        callLLM: mockLLM,
        signal: ac.signal,
      })
    ).rejects.toThrow(/aborted/i);
  });

  it('AL8: onStepComplete 回调在每轮执行后触发', async () => {
    const stepMessages: AgentMessage[][] = [];

    const mockLLM = createMockLLM([
      {
        content: null,
        tool_calls: [{ id: 'call_1', name: 'calculate', arguments: '{"expression":"1+1"}' }],
        finish_reason: 'tool_calls',
      },
      { content: '结果是 2', tool_calls: null, finish_reason: 'stop' },
    ]);

    await createAgentLoop({
      messages: [{ role: 'user', content: '1+1' }],
      tools: [calculatorTool],
      callLLM: mockLLM,
      onStepComplete: (msgs) => stepMessages.push(msgs),
    });

    // 应触发 2 次：工具执行后 + 最终回答后
    expect(stepMessages).toHaveLength(2);
  });
});
