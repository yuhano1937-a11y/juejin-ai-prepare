/**
 * @file sse-split.ts
 * @description WHATWG 规范合规的 SSE 分词与事件组装转换流
 */

import type { SSEEvent } from '../types';

/**
 * 将文本字符串流按 WHATWG SSE 规范精确切分、解析字段并组装为 SSEEvent 对象的 TransformStream
 */
export class SSESplitTransform extends TransformStream<string, SSEEvent> {
  constructor() {
    let buffer = '';
    let currentEvent = '';
    let currentData = '';
    let currentId = '';
    let currentRetry: number | undefined = undefined;

    /**
     * 派发当前暂存的完整事件
     */
    const dispatchCurrentEvent = (controller: TransformStreamDefaultController<SSEEvent>) => {
      // 只有当有 data 或者明确指定了非空的 event 时才派发事件
      if (currentData.length > 0 || currentEvent.length > 0) {
        controller.enqueue({
          event: currentEvent || 'message',
          data: currentData,
          id: currentId || undefined,
          retry: currentRetry,
        });
      }
      // 重置事件暂存区，保留 currentId
      currentEvent = '';
      currentData = '';
    };

    /**
     * 处理单行文本并提取规范定义的 field 与 value
     */
    const processLine = (line: string, controller: TransformStreamDefaultController<SSEEvent>) => {
      // 1. 空行：标志着一个事件块的结束，触发事件派发
      if (line === '') {
        dispatchCurrentEvent(controller);
        return;
      }

      // 2. 注释行：以 ':' 开头，通常作为服务端保活心跳，按规范静默忽略
      if (line.startsWith(':')) {
        return;
      }

      // 3. 解析字段与值
      let field: string;
      let value: string;
      const colonIndex = line.indexOf(':');

      if (colonIndex !== -1) {
        field = line.slice(0, colonIndex);
        let rawValue = line.slice(colonIndex + 1);
        // 规范：如果冒号后紧邻一个空格 (U+0020)，需去除该首空格
        if (rawValue.startsWith(' ')) {
          rawValue = rawValue.slice(1);
        }
        value = rawValue;
      } else {
        // 无冒号时整行为 field，value 为空串
        field = line;
        value = '';
      }

      // 4. 根据字段名更新暂存状态
      switch (field) {
        case 'data':
          // 规范：同一个事件内的多个 data 行，使用单个换行符 '\n' 拼接
          if (currentData.length > 0) {
            currentData += '\n' + value;
          } else {
            currentData = value;
          }
          break;

        case 'event':
          currentEvent = value;
          break;

        case 'id':
          // 规范：如果 value 含有空字符 U+0000 则忽略该 id 字段
          if (!value.includes('\u0000')) {
            currentId = value;
          }
          break;

        case 'retry':
          // 规范：仅由十进制整数组成的 retry 值才合法
          if (/^\d+$/.test(value)) {
            currentRetry = parseInt(value, 10);
          }
          break;

        default:
          // 忽略未知字段
          break;
      }
    };

    super({
      transform(chunk, controller) {
        buffer += chunk;

        // 正确处理 CRLF (\r\n)、CR (\r) 与 LF (\n)
        let position = 0;
        while (position < buffer.length) {
          const crIndex = buffer.indexOf('\r', position);
          const lfIndex = buffer.indexOf('\n', position);

          let lineEnd = -1;
          let delimiterLength = 0;

          if (crIndex !== -1 && lfIndex !== -1) {
            if (crIndex + 1 === lfIndex) {
              lineEnd = crIndex;
              delimiterLength = 2; // \r\n (CRLF)
            } else if (crIndex < lfIndex) {
              lineEnd = crIndex;
              delimiterLength = 1; // \r
            } else {
              lineEnd = lfIndex;
              delimiterLength = 1; // \n
            }
          } else if (crIndex !== -1) {
            if (crIndex === buffer.length - 1) {
              break; // \r 恰好在 chunk 边缘，等待下一分片
            }
            lineEnd = crIndex;
            delimiterLength = 1;
          } else if (lfIndex !== -1) {
            lineEnd = lfIndex;
            delimiterLength = 1;
          } else {
            break;
          }

          const line = buffer.slice(position, lineEnd);
          processLine(line, controller);
          position = lineEnd + delimiterLength;
        }

        buffer = buffer.slice(position);
      },

      flush(controller) {
        if (buffer.length > 0) {
          processLine(buffer, controller);
          buffer = '';
        }
        dispatchCurrentEvent(controller);
      },
    });
  }
}
