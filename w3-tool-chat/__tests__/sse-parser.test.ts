/**
 * @file sse-parser.test.ts
 * @description 针对 WHATWG 规范合规 SSE 解析器与 TransformStream 管道的 12 项严苛边界单元测试
 */

import { describe, it, expect } from 'vitest';
import { parseSSEStream, createSSEStream } from '../lib/stream-parser/core/sse-parser';
import { createMockStream } from './helpers/mock-stream';
import type { SSEEvent } from '../lib/stream-parser/core/types';

/**
 * 辅助函数：从异步迭代器中收集所有派发的事件
 */
async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const evt of parseSSEStream(stream)) {
    events.push(evt);
  }
  return events;
}

describe('SSE Parser & Pipeline (WHATWG 规范合规测试)', () => {
  // T1: 正常流依次到达
  it('T1: 正常流 - 多个事件依次到达并正确解析', async () => {
    const stream = createMockStream([
      'data: first\n\n',
      'data: second\n\n',
      'data: third\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ event: 'message', data: 'first' });
    expect(events[1]).toEqual({ event: 'message', data: 'second' });
    expect(events[2]).toEqual({ event: 'message', data: 'third' });
  });

  // T2: 粘包场景
  it('T2: 粘包 - 多个事件在同一个 chunk 内粘连到达', async () => {
    const stream = createMockStream([
      'data: event1\n\ndata: event2\n\ndata: event3\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.data)).toEqual(['event1', 'event2', 'event3']);
  });

  // T3: 半包场景
  it('T3: 半包 - 单个事件被切断跨多个 chunk 到达', async () => {
    const stream = createMockStream([
      'dat',
      'a: hel',
      'lo world\n',
      '\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('hello world');
  });

  // T4: 复杂长 JSON 跨多分片到达
  it('T4: 复杂 JSON 文本在多个 chunk 间被任意切割', async () => {
    const jsonPart1 = 'data: {"id":"123","choices":[{"delta":{"content":"';
    const jsonPart2 = '前端大模型流式解析';
    const jsonPart3 = '"}}]}\n\n';

    const stream = createMockStream([jsonPart1, jsonPart2, jsonPart3]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);

    const parsed = JSON.parse(events[0].data);
    expect(parsed.choices[0].delta.content).toBe('前端大模型流式解析');
  });

  // T5: 心跳与注释行过滤
  it('T5: 心跳夹杂 - 规范过滤以冒号开头的保活注释行', async () => {
    const stream = createMockStream([
      ': ping\n\n',
      'data: normal data\n\n',
      ': keep-alive\n\n',
      'data: next data\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe('normal data');
    expect(events[1].data).toBe('next data');
  });

  // T6: UTF-8 多字节跨 chunk 切割
  it('T6: UTF-8 分割 - 中文字符字节被硬性跨 chunk 切割时绝不乱码', async () => {
    // “你好” 的 UTF-8 编码:
    // “你”: [0xE4, 0xBD, 0xA0]
    // “好”: [0xE5, 0xA5, 0xBD]
    const headerBytes = new TextEncoder().encode('data: ');
    const part1 = new Uint8Array([...headerBytes, 0xe4]); // 只有“你”的第 1 个字节
    const part2 = new Uint8Array([0xbd, 0xa0, 0xe5, 0xa5]); // “你”的后 2 个字节 + “好”的前 2 个字节
    const part3 = new Uint8Array([0xbd, 0x0a, 0x0a]); // “好”的第 3 个字节 + \n\n

    const stream = createMockStream([part1, part2, part3]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('你好');
  });

  // T7: 空流与快速结束
  it('T7: 空流 - 只有 [DONE] 或流直接结束不产生冗余事件', async () => {
    const stream = createMockStream(['data: [DONE]\n\n']);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('[DONE]');

    const emptyStream = createMockStream([]);
    const emptyEvents = await collectEvents(emptyStream);
    expect(emptyEvents).toHaveLength(0);
  });

  // T8: 网络异常中断与资源释放
  it('T8: 网络中断 - 中途发生连接异常时正确向外抛出错误', async () => {
    const expectedError = new Error('ECONNRESET: Socket hung up');
    const stream = createMockStream(['data: msg1\n\n', 'data: msg2\n\n'], {
      errorAfterChunkIndex: 0,
      mockError: expectedError,
    });

    const received: SSEEvent[] = [];
    await expect(async () => {
      for await (const evt of parseSSEStream(stream)) {
        received.push(evt);
      }
    }).rejects.toThrow('ECONNRESET');

    expect(received).toHaveLength(1);
    expect(received[0].data).toBe('msg1');
  });

  // T9: 多行 data 拼接
  it('T9: 多行 data - 同一个事件内多行 data 用换行符连接', async () => {
    const stream = createMockStream([
      'data: line 1\ndata: line 2\ndata: line 3\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('line 1\nline 2\nline 3');
  });

  // T10: BOM 剥离
  it('T10: BOM 开头 - 流首字节包含 UTF-8 BOM 标记时自动剥离', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const body = new TextEncoder().encode('data: with BOM\n\n');
    const chunk = new Uint8Array(bom.length + body.length);
    chunk.set(bom, 0);
    chunk.set(body, bom.length);

    const stream = createMockStream([chunk]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0].data).toBe('with BOM');
  });

  // T11: Windows 换行符与 CR 处理
  it('T11: 换行兼容 - CRLF (\\r\\n) 与单独的 CR (\\r) 均能正确识别', async () => {
    const stream = createMockStream([
      'data: crlf event\r\n\r\n',
      'data: cr event\r\r',
      'data: mixed event\r\n\n',
    ]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(3);
    expect(events[0].data).toBe('crlf event');
    expect(events[1].data).toBe('cr event');
    expect(events[2].data).toBe('mixed event');
  });

  // T12: 完整字段提取与冒号后空格处理
  it('T12: 字段提取 - event / id / retry 及紧邻冒号无空格处理', async () => {
    const payload = [
      'event: custom_event\n',
      'id: evt-001\n',
      'retry: 5000\n',
      'data:no_space_after_colon\n',
      '\n',
    ].join('');

    const stream = createMockStream([payload]);
    const events = await collectEvents(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      event: 'custom_event',
      id: 'evt-001',
      retry: 5000,
      data: 'no_space_after_colon',
    });
  });
});
