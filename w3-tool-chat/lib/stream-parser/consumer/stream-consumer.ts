/**
 * @file stream-consumer.ts
 * @description 生产级流式消费客户端：基于 Map 注册表驱动的协议分发中心
 */

import { parseSSEStream } from '../core/sse-parser';
import type { ProviderAdapter, StreamConsumerOptions } from '../core/types';
import { OpenAIAdapter } from '../adapters/openai';
import { ClaudeAdapter } from '../adapters/claude';
import { TokenBatcher } from '../core/transforms/token-batch';

export interface StreamConsumerHandle {
  /** 主动中止当前流式消费 */
  abort: () => void;
  /** 等待流完全读取并解析完毕的 Promise */
  done: Promise<void>;
}

export type SupportedProtocol = 'openai' | 'claude';

/**
 * 供应商标识 -> 协议类型映射注册表 (Registry)
 */
const PROVIDER_PROTOCOL_REGISTRY = new Map<string, SupportedProtocol>([
  // 1. 国际主流模型服务商 (OpenAI 兼容)
  ['openai', 'openai'],
  ['gemini', 'openai'],      // Google Gemini (基于 /v1beta/openai/ 兼容端点)
  ['google', 'openai'],
  ['mistral', 'openai'],
  ['groq', 'openai'],        // Groq 极速推理云
  ['together', 'openai'],    // Together AI
  ['fireworks', 'openai'],   // Fireworks AI
  ['perplexity', 'openai'],

  // 2. 中国头部大模型服务商 (OpenAI 兼容)
  ['deepseek', 'openai'],    // 深度求索 (V3 / R1)
  ['kimi', 'openai'],        // 月之暗面
  ['moonshot', 'openai'],
  ['qwen', 'openai'],        // 通义千问 (需使用 /compatible-mode/v1 兼容端点)
  ['doubao', 'openai'],      // 字节跳动豆包
  ['volcengine', 'openai'],  // 火山引擎方舟
  ['ark', 'openai'],
  ['glm', 'openai'],         // 智谱 AI (GLM-4)
  ['zhipu', 'openai'],
  ['yi', 'openai'],          // 零一万物
  ['minimax', 'openai'],     // MiniMax (海螺 AI)
  ['baichuan', 'openai'],    // 百川智能
  ['stepfun', 'openai'],     // 阶跃星辰 (Step-2)
  ['siliconflow', 'openai'], // 硅基流动聚合云

  // 3. 本地与自建推理框架 (OpenAI 兼容)
  ['ollama', 'openai'],      // 本地部署事实标准
  ['vllm', 'openai'],        // 高性能自建服务
  ['local', 'openai'],
  ['llama', 'openai'],       // 任意兼容 OpenAI 规范的 Llama 托管服务

  // 4. Anthropic Claude 事件驱动状态机流
  ['claude', 'claude'],
  ['anthropic', 'claude'],
]);

/**
 * 动态注册或覆盖供应商别名（为自研网关或新服务商提供零侵入扩展能力）
 *
 * @param alias 供应商名称，不区分大小写，如 'my-company-gateway'
 * @param protocol 遵循的协议标准：'openai' | 'claude'
 */
export function registerProviderProtocol(alias: string, protocol: SupportedProtocol): void {
  PROVIDER_PROTOCOL_REGISTRY.set(alias.toLowerCase().trim(), protocol);
}

/**
 * 获取当前所有已内置注册的供应商标识列表
 */
export function getRegisteredProviders(): string[] {
  return Array.from(PROVIDER_PROTOCOL_REGISTRY.keys());
}

/**
 * 协议解析工厂：
 * 通过注册表检索将外部厂商名称高效分发至对应的协议适配器，消除臃肿代码
 */
export function resolveAdapter(provider: string | ProviderAdapter = 'openai'): ProviderAdapter {
  if (typeof provider !== 'string') {
    return provider;
  }

  const normalized = provider.toLowerCase().trim();
  const protocol = PROVIDER_PROTOCOL_REGISTRY.get(normalized);

  if (protocol === 'openai') {
    return new OpenAIAdapter();
  }

  if (protocol === 'claude') {
    return new ClaudeAdapter();
  }

  throw new Error(
    `[w2-stream-parser] Unknown provider: "${provider}".\n` +
    `Supported providers: ${getRegisteredProviders().slice(0, 10).join(', ')}... (total ${PROVIDER_PROTOCOL_REGISTRY.size})\n` +
    `If your provider is OpenAI-compatible, either use provider: 'openai', ` +
    `or register it dynamically via registerProviderProtocol('${provider}', 'openai').`
  );
}

/**
 * 创建并启动流式消费处理器
 */
export function createStreamConsumer(
  byteStream: ReadableStream<Uint8Array>,
  options: StreamConsumerOptions = {}
): StreamConsumerHandle {
  const {
    provider = 'openai',
    onToken,
    onReasoning,
    onToolCall,
    onUsage,
    onDone,
    onError,
    batchStrategy = 'none',
  } = options;

  const adapter = resolveAdapter(provider);
  const abortController = new AbortController();

  // 初始化 Token 攒批器（支持 rAF 平滑防掉帧渲染）
  const batcher = onToken
    ? new TokenBatcher(batchStrategy, (batch) => {
      if (!abortController.signal.aborted) {
        onToken(batch);
      }
    })
    : null;

  const abort = () => {
    abortController.abort();
  };

  const donePromise = (async () => {
    try {
      for await (const event of parseSSEStream(byteStream, abortController.signal)) {
        if (abortController.signal.aborted) {
          break;
        }

        // 1. 检查是否为流终止信号
        if (adapter.isStreamEnd(event)) {
          break;
        }

        // 2. 提取文本增量
        const textDelta = adapter.extractTextDelta(event);
        if (textDelta !== null) {
          if (batcher) {
            batcher.push(textDelta);
          } else if (onToken) {
            onToken(textDelta);
          }
        }

        // 2.1 提取思考链增量 (针对 DeepSeek R1 / Kimi 等推理模型)
        if (onReasoning && adapter.extractReasoningDelta) {
          const reasoningDelta = adapter.extractReasoningDelta(event);
          if (reasoningDelta !== null) {
            onReasoning(reasoningDelta);
          }
        }

        // 3. 提取工具调用增量（为 W3 预留通道）
        if (onToolCall) {
          const toolCallDelta = adapter.extractToolCallDelta(event);
          if (toolCallDelta !== null) {
            onToolCall(toolCallDelta);
          }
        }

        // 4. 提取 Token 使用量统计
        if (onUsage) {
          const usage = adapter.extractUsage(event);
          if (usage !== null) {
            onUsage(usage);
          }
        }
      }

      // 冲刷残留的攒批缓存
      batcher?.flush();

      if (!abortController.signal.aborted) {
        onDone?.();
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        throw error;
      }
    } finally {
      batcher?.flush();
    }
  })();

  return {
    abort,
    done: donePromise,
  };
}
