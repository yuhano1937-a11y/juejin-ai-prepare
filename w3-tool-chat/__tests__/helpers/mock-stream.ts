/**
 * @file mock-stream.ts
 * @description 测试专用的 Mock Stream 生成工具：支持字符串/字节分片、时延控制与主动断网模拟
 */

export interface MockStreamOptions {
  /** 两个 chunk 之间的模拟时延（毫秒） */
  delayMs?: number;
  /** 在成功发出第 N 个 chunk 之后（即下一次拉取时）抛出模拟网络异常（0-indexed） */
  errorAfterChunkIndex?: number;
  /** 抛出的模拟异常对象 */
  mockError?: Error;
}

/**
 * 将给定的分片数组包装为一个标准 ReadableStream<Uint8Array>
 *
 * @param chunks 分片数组，可以是 string 或 Uint8Array
 * @param options 时延与异常控制选项
 */
export function createMockStream(
  chunks: (string | Uint8Array)[],
  options: MockStreamOptions = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { delayMs = 0, errorAfterChunkIndex, mockError = new Error('Mock network error') } = options;

  let currentIndex = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (errorAfterChunkIndex !== undefined && currentIndex > errorAfterChunkIndex) {
        controller.error(mockError);
        return;
      }

      if (currentIndex >= chunks.length) {
        controller.close();
        return;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const item = chunks[currentIndex];
      const byteChunk = typeof item === 'string' ? encoder.encode(item) : item;

      controller.enqueue(byteChunk);
      currentIndex++;
    },
  });
}
