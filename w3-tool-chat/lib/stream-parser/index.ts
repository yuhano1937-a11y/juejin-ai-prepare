/**
 * @file index.ts
 * @description stream-parser 统一导出入口
 */

// 1. 核心管道与解析
export { createSSEStream, parseSSEStream } from './core/sse-parser';
export { ByteToTextTransform } from './core/transforms/byte-to-text';
export { SSESplitTransform } from './core/transforms/sse-split';
export { TokenBatchTransform, TokenBatcher } from './core/transforms/token-batch';
export type { BatchStrategy } from './core/transforms/token-batch';

// 2. 高级消费 API 与注册表
export {
  createStreamConsumer,
  resolveAdapter,
  registerProviderProtocol,
  getRegisteredProviders,
} from './consumer/stream-consumer';
export type {
  StreamConsumerHandle,
  SupportedProtocol,
} from './consumer/stream-consumer';

// 3. 厂商适配器
export { OpenAIAdapter } from './adapters/openai';
export { ClaudeAdapter } from './adapters/claude';
export { safeJsonParse } from './adapters/adapter';

// 4. 核心类型
export type {
  SSEEvent,
  TokenUsage,
  ToolCallDelta,
  ParsedChunk,
  ProviderAdapter,
  StreamConsumerOptions,
} from './core/types';
