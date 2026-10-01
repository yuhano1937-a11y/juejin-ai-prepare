import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from './types';

/**
 * 类型安全的工具注册中心
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition<any, any>> = new Map();

  /**
   * 注册工具
   * @param tool 工具定义
   */
  register<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 按名称查找工具
   * @param name 工具名称
   * @returns 找到的工具定义，否则返回 undefined
   */
  get(name: string): ToolDefinition<any, any> | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取 OpenAI 标准 tools 参数数组
   * @returns 转换后的 JSON Schema 工具数组
   */
  getOpenAITools(): any[] {
    return Array.from(this.tools.values()).map((tool) => {
      // zod v4 与 zod-to-json-schema 存在类型定义差异，但运行时转换完全正确
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsonSchema = zodToJsonSchema(tool.schema as any, { target: 'jsonSchema7' });
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            ...jsonSchema,
            additionalProperties: false, // 满足 strict 模式要求
          },
        },
      };
    });
  }

  /**
   * 执行工具调用
   * 异常时返回包装的 JSON 字符串，不抛出异常，让 LLM 自省重试
   * @param name 工具名称
   * @param argsString JSON 字符串参数
   * @returns 字符串化后的执行结果
   */
  async execute(name: string, argsString: string): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return JSON.stringify({ error: `Tool ${name} not found` });
    }

    try {
      const argsObj = JSON.parse(argsString || '{}');
      const parsedArgs = tool.schema.parse(argsObj);
      const result = await tool.execute(parsedArgs);
      return JSON.stringify(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ error: `Tool execution failed: ${errorMessage}` });
    }
  }
}
