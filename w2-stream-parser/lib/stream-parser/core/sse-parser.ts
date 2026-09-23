/**
 * @file sse-parser.ts
 * @description 组合字节解码与规范切分，输出 SSEEvent 可读流与异步迭代器
 */

import { ByteToTextTransform } from './transforms/byte-to-text';
import { SSESplitTransform } from './transforms/sse-split';
import type { SSEEvent } from './types';

/**
 * 将原始字节流通过 TransformStream 管道转换为标准 SSEEvent 可读流
 *
 * @param byteStream 原始二进制可读流 (例如 fetch 得到的 res.body)
 * @returns 解析后的 SSEEvent 可读流
 */
export function createSSEStream(byteStream: ReadableStream<Uint8Array>): ReadableStream<SSEEvent> {
  return byteStream
    .pipeThrough(new ByteToTextTransform())
    .pipeThrough(new SSESplitTransform());
}

/**
 * 将原始字节流转换为支持 for-await-of 的异步迭代器
 *
 * @param byteStream 原始二进制可读流
 * @param signal 可选的 AbortSignal 控制信号，触发时立即终止读取并释放资源
 *
 * @example
 * ```ts
 * for await (const event of parseSSEStream(res.body)) {
 *   console.log(event.event, event.data);
 * }
 * ```
 */
export async function* parseSSEStream(
  byteStream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent, void, unknown> {
  const eventStream = createSSEStream(byteStream);
  const reader = eventStream.getReader();

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel('Operation aborted by signal');
        break;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
