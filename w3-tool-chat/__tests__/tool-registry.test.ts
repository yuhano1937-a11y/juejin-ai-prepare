import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../lib/agent/tool-registry';
import { weatherTool } from '../lib/agent/tools/weather';
import { calculatorTool } from '../lib/agent/tools/calculator';

describe('ToolRegistry', () => {
  it('TR1: 注册与查找 - 注册后能按名称正确查找', () => {
    const registry = new ToolRegistry();
    registry.register(weatherTool);

    const found = registry.get('get_weather');
    expect(found).toBeDefined();
    expect(found!.name).toBe('get_weather');
  });

  it('TR2: 未注册工具查找 - 返回 undefined', () => {
    const registry = new ToolRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('TR3: getOpenAITools - 导出符合 OpenAI 规范的 tools 数组', () => {
    const registry = new ToolRegistry();
    registry.register(weatherTool);
    registry.register(calculatorTool);

    const tools = registry.getOpenAITools();
    expect(tools).toHaveLength(2);
    // 验证结构
    expect(tools[0].type).toBe('function');
    expect(tools[0].function.name).toBe('get_weather');
    expect(tools[0].function.description).toBeTruthy();
    expect(tools[0].function.parameters).toBeDefined();
    expect(tools[0].function.parameters.additionalProperties).toBe(false);
    // 验证第二个工具
    expect(tools[1].function.name).toBe('calculate');
  });

  it('TR4: execute - 成功执行工具并返回 JSON 字符串结果', async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);

    const result = await registry.execute('calculate', '{"expression":"2 + 3"}');
    const parsed = JSON.parse(result);
    expect(parsed.result).toBe(5);
    expect(parsed.expression).toBe('2 + 3');
  });

  it('TR5: execute - 未注册工具返回错误 JSON 而非抛出异常', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute('nonexistent', '{}');
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('not found');
  });

  it('TR6: execute - 参数校验失败返回错误 JSON', async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);

    // calculatorTool 需要 expression 字段
    const result = await registry.execute('calculate', '{}');
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeTruthy();
  });

  it('TR7: 天气工具执行 - 同一城市返回确定性结果', async () => {
    const registry = new ToolRegistry();
    registry.register(weatherTool);

    const result1 = await registry.execute('get_weather', '{"city":"北京"}');
    const result2 = await registry.execute('get_weather', '{"city":"北京"}');
    const parsed1 = JSON.parse(result1);
    const parsed2 = JSON.parse(result2);

    // 同城市应得到相同温度和天气条件（确定性模拟）
    expect(parsed1.temperature).toBe(parsed2.temperature);
    expect(parsed1.condition).toBe(parsed2.condition);
    expect(parsed1.city).toBe('北京');
  });
});
