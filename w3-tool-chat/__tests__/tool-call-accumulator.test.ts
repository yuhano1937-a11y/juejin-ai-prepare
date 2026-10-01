import { describe, it, expect } from 'vitest';
import { ToolCallAccumulator } from '../lib/agent/tool-call-accumulator';

describe('ToolCallAccumulator', () => {
  it('TA1: 单工具单分片 - 一次性到达完整的工具调用', () => {
    const acc = new ToolCallAccumulator();
    acc.addDelta({
      index: 0,
      id: 'call_123',
      name: 'get_weather',
      arguments: '{"city":"北京"}',
    });

    const result = acc.getAssembled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('call_123');
    expect(result[0].name).toBe('get_weather');
    expect(result[0].arguments).toBe('{"city":"北京"}');
  });

  it('TA2: 单工具多分片 - arguments 增量拼接', () => {
    const acc = new ToolCallAccumulator();
    // 第一个分片：携带 id 和 name
    acc.addDelta({ index: 0, id: 'call_456', name: 'calculate', arguments: '' });
    // 后续分片：只有 arguments 增量
    acc.addDelta({ index: 0, arguments: '{"expr' });
    acc.addDelta({ index: 0, arguments: 'ession":' });
    acc.addDelta({ index: 0, arguments: ' "123 *' });
    acc.addDelta({ index: 0, arguments: ' 456"}' });

    const result = acc.getAssembled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('call_456');
    expect(result[0].name).toBe('calculate');
    expect(result[0].arguments).toBe('{"expression": "123 * 456"}');
  });

  it('TA3: 并行双工具 - 按 index 交叉到达的分片正确聚合', () => {
    const acc = new ToolCallAccumulator();
    // 工具 0 开始
    acc.addDelta({ index: 0, id: 'call_a', name: 'get_weather', arguments: '' });
    // 工具 1 开始
    acc.addDelta({ index: 1, id: 'call_b', name: 'calculate', arguments: '' });
    // 工具 0 参数
    acc.addDelta({ index: 0, arguments: '{"city":"上海"}' });
    // 工具 1 参数
    acc.addDelta({ index: 1, arguments: '{"expression":"1+1"}' });

    const result = acc.getAssembled();
    expect(result).toHaveLength(2);
    // 按 index 排序
    expect(result[0].name).toBe('get_weather');
    expect(result[0].arguments).toBe('{"city":"上海"}');
    expect(result[1].name).toBe('calculate');
    expect(result[1].arguments).toBe('{"expression":"1+1"}');
  });

  it('TA4: 空参数边界 - id 和 name 缺失时使用空串兜底', () => {
    const acc = new ToolCallAccumulator();
    acc.addDelta({ index: 0 });

    const result = acc.getAssembled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('');
    expect(result[0].name).toBe('');
    expect(result[0].arguments).toBe('');
  });

  it('TA5: hasToolCalls - 空状态返回 false，添加后返回 true', () => {
    const acc = new ToolCallAccumulator();
    expect(acc.hasToolCalls()).toBe(false);

    acc.addDelta({ index: 0, id: 'call_1', name: 'test' });
    expect(acc.hasToolCalls()).toBe(true);
  });

  it('TA6: reset - 清空所有状态', () => {
    const acc = new ToolCallAccumulator();
    acc.addDelta({ index: 0, id: 'call_1', name: 'test', arguments: '{}' });
    expect(acc.hasToolCalls()).toBe(true);

    acc.reset();
    expect(acc.hasToolCalls()).toBe(false);
    expect(acc.getAssembled()).toHaveLength(0);
  });
});
