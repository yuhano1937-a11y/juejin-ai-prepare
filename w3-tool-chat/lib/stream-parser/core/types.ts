/**
 * @file types.ts
 * @description 核心类型契约：WHATWG SSE 规范、标准化 Chunk、Token 统计与适配器接口
 */

/**
 * WHATWG 规范标准 SSE 事件对象
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export interface SSEEvent {
  /** 事件类型，默认为 'message' */
  event: string;
  /** 事件数据载荷。多行 data 按照规范以换行符 '\n' 拼接 */
  data: string;
  /** 事件唯一 ID，用于断线重连恢复 */
  id?: string;
  /** 客户端重连等待时间（毫秒） */
  retry?: number;
}

/**
 * 大模型 Token 计费与使用量统计
 */
export interface TokenUsage {
  /** 输入/提示词所占用的 Token 数 */
  promptTokens: number;
  /** 模型生成/补全所占用的 Token 数 */
  completionTokens: number;
  /** 累计总消耗 Token 数 */
  totalTokens: number;
}

/**
 * 流式场景下逐步到达的工具调用增量分片
 */
export interface ToolCallDelta {
  /** 在并行工具调用中的索引位置（0, 1, 2...） */
  index: number;
  /** 工具调用的唯一标识 ID（通常仅在第一个分片中提供） */
  id?: string;
  /** 工具/函数名称（分片到达，需拼接） */
  name?: string;
  /** 工具调用的入参 JSON 字符串（分片到达，需拼接完成后反序列化） */
  arguments?: string;
}

/**
 * 经过业务适配器解析后的标准化 Token 结果
 */
export interface ParsedChunk {
  /** 区分当前块的内容类别 */
  type: 'text' | 'reasoning' | 'tool_call' | 'usage' | 'done' | 'comment';
  /** 文本增量（当 type 为 'text' 时存在） */
  text?: string;
  /** 思考链增量（例如 DeepSeek R1 的 reasoning_content） */
  reasoning?: string;
  /** 工具调用增量（当 type 为 'tool_call' 时存在） */
  toolCall?: ToolCallDelta;
  /** 统计信息（当 type 为 'usage' 时存在） */
  usage?: TokenUsage;
  /** 原始 SSE 事件，便于调试或扩展 */
  raw?: SSEEvent;
}

/**
 * 大模型提供商协议适配器接口（策略模式）
 * 负责将不同厂商差异化的 SSE 帧提取为标准字段
 */
export interface ProviderAdapter {
  /** 适配器名称，例如 'openai' | 'claude' */
  readonly name: string;

  /**
   * 从原始 SSE 事件中解析提取文本增量
   * @param event 原始 SSE 事件
   * @returns 文本内容或 null
   */
  extractTextDelta(event: SSEEvent): string | null;

  /**
   * 从原始 SSE 事件中解析提取深度思考链增量（例如 DeepSeek R1 / Kimi 的 reasoning_content）
   * @param event 原始 SSE 事件
   * @returns 思考过程内容或 null
   */
  extractReasoningDelta?(event: SSEEvent): string | null;

  /**
   * 从原始 SSE 事件中解析提取工具调用增量
   * @param event 原始 SSE 事件
   * @returns 工具调用分片或 null
   */
  extractToolCallDelta(event: SSEEvent): ToolCallDelta | null;

  /**
   * 判断当前 SSE 事件是否标志着流的结束
   * @param event 原始 SSE 事件
   */
  isStreamEnd(event: SSEEvent): boolean;

  /**
   * 从原始 SSE 事件中解析提取 Token 消耗指标
   * @param event 原始 SSE 事件
   * @returns Token 使用量或 null
   */
  extractUsage(event: SSEEvent): TokenUsage | null;
}

/**
 * 流式消费者的高级配置选项
 */
export interface StreamConsumerOptions {
  /** 使用的协议适配器名称或自定义适配器实例，默认 'openai' */
  provider?: string | ProviderAdapter;
  /** 逐 token 文本产出时的回调 */
  onToken?: (token: string) => void;
  /** 思考链（Reasoning）逐 token 产出时的回调（针对 DeepSeek R1 等） */
  onReasoning?: (reasoning: string) => void;
  /** 工具调用分片产出时的回调 */
  onToolCall?: (toolCall: ToolCallDelta) => void;
  /** 获取到 Token 消耗统计时的回调 */
  onUsage?: (usage: TokenUsage) => void;
  /** 流正常结束回调 */
  onDone?: () => void;
  /** 异常捕获回调 */
  onError?: (error: Error) => void;
  /** 攒批更新策略：'none' 立即触发；'raf' 通过 requestAnimationFrame 攒批；自定义时间间隔 */
  batchStrategy?: 'none' | 'raf' | { intervalMs: number };
}
