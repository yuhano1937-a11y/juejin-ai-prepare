/**
 * @file openai.ts
 * @description 工业级 OpenAI 兼容协议流式适配器
 */

import type { SSEEvent, ProviderAdapter, ToolCallDelta, TokenUsage } from '../core/types';
import { safeJsonParse } from './adapter';

interface OpenAIDelta {
  /** 正常输出文本（可能为 null、空串或字符串） */
  content?: string | null;
  /** DeepSeek R1 / Kimi 等思考模型的深度思维链内容 */
  reasoning_content?: string | null;
  /** 工具调用增量分片 */
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

interface OpenAIChoice {
  index: number;
  delta?: OpenAIDelta;
  /**
   * 结束原因：可能为 null/undefined（生成中），
   * 或 'stop' | 'length' | 'tool_calls' | 'content_filter' 等标志完成
   */
  finish_reason?: string | null;
}

interface OpenAIStreamChunk {
  id?: string;
  choices?: OpenAIChoice[];
  /** Token 消耗指标（兼容 OpenAI、DeepSeek、Kimi 等不同位置及别名注入） */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null;
}

/**
 * OpenAI 协议适配器
 */
export class OpenAIAdapter implements ProviderAdapter {
  readonly name = 'openai';

  /**
   * 解决缺失 [DONE] 导致的连接挂起超时
   */
  isStreamEnd(event: SSEEvent): boolean {
    const trimmed = event.data.trim();

    // 1. 标准结束标志: [DONE]
    if (trimmed === '[DONE]') {
      return true;
    }

    const payload = safeJsonParse<OpenAIStreamChunk>(trimmed);
    if (!payload?.choices || payload.choices.length === 0) {
      return false;
    }

    // 2. 厂商不发 [DONE]
    //    检查 finish_reason。无论是因为正常回答完毕 ('stop')、达到最大 token 截断 ('length')、
    //    还是发起工具调用 ('tool_calls') 或敏感词拦截 ('content_filter')，只要其非空且非 null，均代表流已正常终结！
    const finishReason = payload.choices[0]?.finish_reason;
    if (typeof finishReason === 'string' && finishReason.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * 解决 content 为 null、undefined 或空串
   */
  extractTextDelta(event: SSEEvent): string | null {
    if (event.data.trim() === '[DONE]') {
      return null;
    }

    const payload = safeJsonParse<OpenAIStreamChunk>(event.data);
    const content = payload?.choices?.[0]?.delta?.content;

    // 强类型安全防护：必须严格为非空字符串。防范 content: null、content: ""、甚至畸形数据
    if (typeof content === 'string' && content.length > 0) {
      return content;
    }

    return null;
  }

  /**
   * 提取推理模型的深度思考增量 (兼容事实标准 reasoning_content 与部分网关别名 reasoning)
   */
  extractReasoningDelta(event: SSEEvent): string | null {
    if (event.data.trim() === '[DONE]') {
      return null;
    }

    const payload = safeJsonParse<OpenAIStreamChunk>(event.data);
    const delta = payload?.choices?.[0]?.delta;
    const reasoning = delta?.reasoning_content ?? (delta as Record<string, unknown>)?.reasoning;

    if (typeof reasoning === 'string' && reasoning.length > 0) {
      return reasoning;
    }

    return null;
  }

  /**
   * 提取流式 Tool Calls 分片（为 W3 预留）
   */
  extractToolCallDelta(event: SSEEvent): ToolCallDelta | null {
    if (event.data.trim() === '[DONE]') {
      return null;
    }

    const payload = safeJsonParse<OpenAIStreamChunk>(event.data);
    const toolCall = payload?.choices?.[0]?.delta?.tool_calls?.[0];
    if (!toolCall) {
      return null;
    }

    return {
      index: toolCall.index ?? 0,
      id: toolCall.id,
      name: toolCall.function?.name,
      arguments: toolCall.function?.arguments,
    };
  }

  /**
   * 解决不同厂商的命名别名与注入位置
   */
  extractUsage(event: SSEEvent): TokenUsage | null {
    if (event.data.trim() === '[DONE]') {
      return null;
    }

    const payload = safeJsonParse<OpenAIStreamChunk>(event.data);
    if (!payload?.usage) {
      return null;
    }

    // 兼容 prompt_tokens 与 input_tokens
    const promptTokens =
      payload.usage.prompt_tokens ?? payload.usage.input_tokens ?? 0;

    // 兼容 completion_tokens 与 output_tokens
    const completionTokens =
      payload.usage.completion_tokens ?? payload.usage.output_tokens ?? 0;

    const totalTokens =
      payload.usage.total_tokens ?? (promptTokens + completionTokens);

    return {
      promptTokens,
      completionTokens,
      totalTokens,
    };
  }
}
