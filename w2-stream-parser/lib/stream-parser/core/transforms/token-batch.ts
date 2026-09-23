/**
 * @file token-batch.ts
 * @description 流式 Token 渲染性能优化：基于 requestAnimationFrame 或时间间隔的高性能攒批调度
 */

export type BatchStrategy = 'none' | 'raf' | { intervalMs: number };

/**
 * 通用高性能 Token 攒批器，降低高频渲染造成的 UI 掉帧卡顿
 */
export class TokenBatcher {
  private buffer = '';
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private readonly strategy: BatchStrategy;
  private readonly onFlush: (batch: string) => void;

  constructor(strategy: BatchStrategy, onFlush: (batch: string) => void) {
    this.strategy = strategy;
    this.onFlush = onFlush;
  }

  /**
   * 推送新到达的 token 到缓冲区
   */
  push(token: string): void {
    if (this.strategy === 'none') {
      this.onFlush(token);
      return;
    }

    this.buffer += token;

    if (this.strategy === 'raf') {
      // 浏览器环境下使用 requestAnimationFrame，Node/测试环境降级到 setTimeout(16)
      if (typeof requestAnimationFrame === 'function') {
        if (this.rafId === null) {
          this.rafId = requestAnimationFrame(() => {
            this.rafId = null;
            this.drainBuffer();
          });
        }
      } else {
        if (this.timerId === null) {
          this.timerId = setTimeout(() => {
            this.timerId = null;
            this.drainBuffer();
          }, 16);
        }
      }
      return;
    }

    if (typeof this.strategy === 'object' && typeof this.strategy.intervalMs === 'number') {
      if (this.timerId === null) {
        this.timerId = setTimeout(() => {
          this.timerId = null;
          this.drainBuffer();
        }, this.strategy.intervalMs);
      }
    }
  }

  /**
   * 立即冲刷并派发当前缓冲区中的所有 token (通常在流结束或外部取消时调用)
   */
  flush(): void {
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    this.drainBuffer();
  }

  /**
   * 私有内部方法：清空缓冲区并交付给业务层
   */
  private drainBuffer(): void {
    if (this.buffer.length > 0) {
      const batch = this.buffer;
      this.buffer = '';
      this.onFlush(batch);
    }
  }
}

/**
 * 包装为标准 TransformStream 的 Token 攒批转换流
 */
export class TokenBatchTransform extends TransformStream<string, string> {
  constructor(strategy: BatchStrategy = 'raf') {
    let batcher: TokenBatcher;

    super({
      start(controller) {
        batcher = new TokenBatcher(strategy, (batch) => {
          controller.enqueue(batch);
        });
      },
      transform(token) {
        batcher.push(token);
      },
      flush() {
        batcher.flush();
      },
    });
  }
}
