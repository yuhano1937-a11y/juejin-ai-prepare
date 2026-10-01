/**
 * @file claude.ts
 * @description Anthropic Claude 标准协议流式适配器
 */

import type { SSEEvent, ProviderAdapter, ToolCallDelta, TokenUsage } from '../core/types';
import { safeJsonParse } from './adapter';

interface ClaudeContentBlockDelta {
  type: 'content_block_delta';
  index: number;
  delta: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
}

interface ClaudeContentBlockStart {
  type: 'content_block_start';
  index: number;
  content_block: {
    type: 'text' | 'tool_use';
    id?: string;
    name?: string;
  };
}

interface ClaudeMessageStart {
  type: 'message_start';
  message: {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };
}

interface ClaudeMessageDelta {
  type: 'message_delta';
  usage?: {
    output_tokens?: number;
  };
}

/**
 * 适配 Anthropic Claude 3 / 3.5 / 3.7 流式协议
 */
export class ClaudeAdapter implements ProviderAdapter {
  readonly name = 'claude';

  isStreamEnd(event: SSEEvent): boolean {
    return event.event === 'message_stop';
  }

  extractTextDelta(event: SSEEvent): string | null {
    if (event.event !== 'content_block_delta') {
      return null;
    }

    const payload = safeJsonParse<ClaudeContentBlockDelta>(event.data);
    if (payload?.delta?.type === 'text_delta' && typeof payload.delta.text === 'string') {
      return payload.delta.text;
    }

    return null;
  }

  extractToolCallDelta(event: SSEEvent): ToolCallDelta | null {
    // 处理工具块初始化 (content_block_start)
    if (event.event === 'content_block_start') {
      const payload = safeJsonParse<ClaudeContentBlockStart>(event.data);
      if (payload?.content_block?.type === 'tool_use') {
        return {
          index: payload.index,
          id: payload.content_block.id,
          name: payload.content_block.name,
          arguments: '',
        };
      }
    }

    // 处理工具参数增量 (content_block_delta)
    if (event.event === 'content_block_delta') {
      const payload = safeJsonParse<ClaudeContentBlockDelta>(event.data);
      if (payload?.delta?.type === 'input_json_delta' && payload.delta.partial_json) {
        return {
          index: payload.index,
          arguments: payload.delta.partial_json,
        };
      }
    }

    return null;
  }

  extractUsage(event: SSEEvent): TokenUsage | null {
    if (event.event === 'message_start') {
      const payload = safeJsonParse<ClaudeMessageStart>(event.data);
      const input = payload?.message?.usage?.input_tokens ?? 0;
      return {
        promptTokens: input,
        completionTokens: 0,
        totalTokens: input,
      };
    }

    if (event.event === 'message_delta') {
      const payload = safeJsonParse<ClaudeMessageDelta>(event.data);
      const output = payload?.usage?.output_tokens ?? 0;
      return {
        promptTokens: 0,
        completionTokens: output,
        totalTokens: output,
      };
    }

    return null;
  }
}
