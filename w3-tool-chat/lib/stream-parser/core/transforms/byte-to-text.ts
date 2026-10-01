/**
 * @file byte-to-text.ts
 * @description 字节流转文本转换流：正确处理跨 chunk UTF-8 多字节字符截断与首字节 BOM 剥离
 */

/**
 * 将 Uint8Array 二进制字节流安全解码为 UTF-8 字符串的 TransformStream
 */
export class ByteToTextTransform extends TransformStream<Uint8Array, string> {
  constructor() {
    const decoder = new TextDecoder('utf-8');
    let isFirstChunk = true;

    super({
      transform(chunk, controller) {
        // 保证多字节字符（如中文3字节）跨 chunk 被截断时不会解码为乱码 (\uFFFD)
        let text = decoder.decode(chunk, { stream: true });

        // 剥离流开头可能附带的 UTF-8 BOM (\uFEFF)
        if (isFirstChunk) {
          isFirstChunk = false;
          if (text.charCodeAt(0) === 0xfeff) {
            text = text.slice(1);
          }
        }

        if (text.length > 0) {
          controller.enqueue(text);
        }
      },
      flush(controller) {
        // 流结束时冲刷 Decoder 内部可能残留的尾随字节
        const remaining = decoder.decode();
        if (remaining.length > 0) {
          controller.enqueue(remaining);
        }
      },
    });
  }
}
