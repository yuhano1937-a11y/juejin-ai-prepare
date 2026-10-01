import { ZodSchema } from 'zod';

/**
 * 完整的工具调用（从流式分片聚合后得到）
 */
export interface AssembledToolCall {
  id: string;
  name: string;
  arguments: string; // 原始JSON字符串
}

/**
 * 工具定义接口
 */
export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  schema: ZodSchema<TParams>;
  execute: (params: TParams) => Promise<TResult>;
}

/**
 * Agent 对话中的消息类型（支持 user/assistant/tool 角色）
 */
export type AgentMessage =
  | {
      role: 'system';
      content: string;
    }
  | {
      role: 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }[];
    }
  | {
      role: 'tool';
      tool_call_id: string;
      name: string;
      content: string;
    };

/**
 * LLM 调用接口函数的定义
 */
export type CallLLMFunction = (
  messages: AgentMessage[],
  tools: any[]
) => Promise<{
  content: string | null;
  tool_calls: AssembledToolCall[] | null;
  finish_reason: string;
}>;

/**
 * Agent 循环配置
 */
export interface AgentLoopOptions {
  messages: AgentMessage[];
  tools: ToolDefinition<any, any>[];
  callLLM: CallLLMFunction;
  model?: string;
  maxSteps?: number;
  signal?: AbortSignal;
  onToolCallStart?: (name: string, args: Record<string, unknown>) => void;
  onToolCallEnd?: (name: string, result: unknown) => void;
  onStepComplete?: (messages: AgentMessage[]) => void;
}

/**
 * Agent 循环结果
 */
export interface AgentLoopResult {
  messages: AgentMessage[];
  finalContent: string;
  totalSteps: number;
}
