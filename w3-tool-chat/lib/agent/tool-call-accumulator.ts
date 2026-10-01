import { ToolCallDelta } from '@/lib/stream-parser';
import { AssembledToolCall } from './types';

/**
 * 流式工具调用分片聚合器
 * 核心功能：处理并聚合多路并行的 tool_call 分片
 */
export class ToolCallAccumulator {
  private toolCalls: Map<number, AssembledToolCall> = new Map();

  /**
   * 处理每个流式增量
   * @param delta 流式工具调用分片
   */
  addDelta(delta: ToolCallDelta): void {
    const existing = this.toolCalls.get(delta.index);

    if (existing) {
      if (delta.arguments) {
        existing.arguments += delta.arguments;
      }
    } else {
      this.toolCalls.set(delta.index, {
        id: delta.id || '',
        name: delta.name || '',
        arguments: delta.arguments || '',
      });
    }
  }

  /**
   * 返回排序后的完整工具调用列表
   * @returns 聚合后的完整工具调用列表
   */
  getAssembled(): AssembledToolCall[] {
    return Array.from(this.toolCalls.entries())
      .sort(([indexA], [indexB]) => indexA - indexB)
      .map(([, toolCall]) => toolCall);
  }

  /**
   * 是否有工具调用
   * @returns 有工具调用则返回 true
   */
  hasToolCalls(): boolean {
    return this.toolCalls.size > 0;
  }

  /**
   * 清空状态
   */
  reset(): void {
    this.toolCalls.clear();
  }
}
