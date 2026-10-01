'use client';

/**
 * @file page.tsx
 * @description W3 客户端 Agent Chat 页面
 *
 * 在 W2 的基础上做增量升级：
 * - 保留 createStreamConsumer + onToken + onReasoning + rAF 攒批（W2 全部功能）
 * - 新增 onToolCall → ToolCallAccumulator 集成（兑现 W2 预留的 onToolCall 通道）
 * - 新增客户端 Agent Loop（检测到工具调用 → 执行 → 回传 → 再次调用 LLM）
 * - 新增工具调用状态可视化卡片
 */

import { useRef, useState } from 'react';
import { createStreamConsumer, type StreamConsumerHandle } from '@/lib/stream-parser';
import { ToolCallAccumulator } from '@/lib/agent/tool-call-accumulator';

// ==================== 类型定义 ====================

/** UI 消息模型：在 W2 基础上扩展工具调用状态 */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** W3 新增：工具调用状态列表（仅 assistant 消息） */
  toolCalls?: ToolCallStatus[];
}

/** 单个工具调用的 UI 状态 */
interface ToolCallStatus {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'executing' | 'done';
  result?: unknown;
}

/** 发送给 API 的 OpenAI 兼容消息格式 */
interface ApiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
}

let msgIdCounter = 0;
function genId(): string {
  return `msg_${Date.now()}_${msgIdCounter++}`;
}

/** Agent Loop 最大循环轮次（防止死循环） */
const MAX_AGENT_STEPS = 5;

// ==================== 组件 ====================

export default function ChatPage() {
  // W2 原有状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const consumerRef = useRef<StreamConsumerHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 发送消息并启动客户端 Agent Loop
   *
   * 核心流程：
   * 1. 调用 /api/chat（W2 的流式代理，W3 新增 tools 参数透传）
   * 2. 用 W2 的 createStreamConsumer 消费 SSE 流
   *    - onToken: 流式文本显示（W2 已有）
   *    - onReasoning: DeepSeek 深度思考展示（W2 已有）
   *    - onToolCall: 喂给 ToolCallAccumulator（W3 新增！兑现 W2 预留通道）
   * 3. 流结束后检查 ToolCallAccumulator：
   *    - 无工具调用 → 最终回答已通过 onToken 展示完毕
   *    - 有工具调用 → 调用 /api/tools 执行 → 结果作为 tool 消息回传 → 循环步骤 1
   */
  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = { id: genId(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setThinking('');
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;

    // API 消息列表（OpenAI 兼容格式，跨轮次累积）
    const apiMessages: ApiMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content }) as ApiMessage),
      { role: 'user' as const, content: text },
    ];

    let step = 0;

    try {
      // ========== Agent Loop: 核心循环 ==========
      while (step < MAX_AGENT_STEPS) {
        if (ac.signal.aborted) break;
        step++;

        // 为当前轮次创建 assistant 消息占位符
        const assistantMsgId = genId();
        setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

        // W3 新增：每轮创建新的 ToolCallAccumulator
        const accumulator = new ToolCallAccumulator();
        let textContent = '';

        // 调用 /api/chat —— W2 的流式代理，W3 新增 enableTools
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: apiMessages, enableTools: true }),
          signal: ac.signal,
        });

        if (!res.ok || !res.body) {
          let errorMsg = `网络请求异常 (${res.status})`;
          try {
            const errData = await res.json();
            if (errData?.error) errorMsg = errData.error;
          } catch {
            // 忽略非 JSON 错误响应解析异常
          }
          throw new Error(errorMsg);
        }

        // ========== 核心：使用 W2 的 createStreamConsumer ==========
        // 与 W2 完全相同的调用方式，只是新增了 onToolCall 回调
        const consumer = createStreamConsumer(res.body, {
          provider: 'openai',     // W2 已有：支持 20+ 厂商别名
          batchStrategy: 'raf',   // W2 已有：requestAnimationFrame 60fps 攒批

          // W2 已有：逐 token 文本流式显示
          onToken: (tokenChunk) => {
            textContent += tokenChunk;
            setMessages((prev) => {
              const copy = [...prev];
              const idx = copy.findIndex((m) => m.id === assistantMsgId);
              if (idx !== -1) {
                copy[idx] = { ...copy[idx], content: copy[idx].content + tokenChunk };
              }
              return copy;
            });
          },

          // W2 已有：DeepSeek R1 思维链独立渲染
          onReasoning: (reasoningChunk) => {
            setThinking((prev) => prev + reasoningChunk);
          },

          // ★ W3 新增：接上 W2 预留的 onToolCall 通道！ ★
          // W2 的 stream-consumer.ts 第 171 行写的"为 W3 预留通道"——现在兑现！
          // 每个 ToolCallDelta 分片都被 ToolCallAccumulator 按 index 聚合
          onToolCall: (delta) => {
            accumulator.addDelta(delta);
          },

          onError: (err) => {
            console.error('流异常:', err);
          },
        });

        consumerRef.current = consumer;
        await consumer.done;
        consumerRef.current = null;

        // ========== 流结束：检查是否有工具调用 ==========
        if (accumulator.hasToolCalls()) {
          const toolCalls = accumulator.getAssembled();

          // 解析工具参数用于 UI 展示
          const toolCallStatuses: ToolCallStatus[] = toolCalls.map((tc) => {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.arguments || '{}'); } catch { /* 忽略 */ }
            return { id: tc.id, name: tc.name, args, status: 'executing' as const };
          });

          // UI：显示工具调用卡片（执行中状态）
          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((m) => m.id === assistantMsgId);
            if (idx !== -1) {
              copy[idx] = { ...copy[idx], toolCalls: toolCallStatuses };
            }
            return copy;
          });

          // 调用 /api/tools 执行工具（W3 新增端点）
          const toolRes = await fetch('/api/tools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calls: toolCalls }),
            signal: ac.signal,
          });

          if (!toolRes.ok) {
            throw new Error('工具执行请求失败');
          }

          const { results } = await toolRes.json();

          // UI：更新工具调用卡片为完成状态
          setMessages((prev) => {
            const copy = [...prev];
            const idx = copy.findIndex((m) => m.id === assistantMsgId);
            if (idx !== -1 && copy[idx].toolCalls) {
              copy[idx] = {
                ...copy[idx],
                toolCalls: copy[idx].toolCalls!.map((tc, i) => ({
                  ...tc,
                  status: 'done' as const,
                  result: (() => {
                    try { return JSON.parse(results[i].content); }
                    catch { return results[i].content; }
                  })(),
                })),
              };
            }
            return copy;
          });

          // 构建下一轮 API 消息：assistant（含 tool_calls）+ tool 结果
          apiMessages.push({
            role: 'assistant',
            content: textContent || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });

          for (const result of results) {
            apiMessages.push({
              role: 'tool',
              content: result.content,
              tool_call_id: result.tool_call_id,
              name: result.name,
            });
          }

          // 继续 Agent Loop 下一轮 → 回到 while 循环顶部
        } else {
          // 无工具调用 → 最终回答已通过 onToken 展示完毕，退出循环
          break;
        }
      }

      if (step >= MAX_AGENT_STEPS) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              content: last.content + '\n\n⚠️ Agent 循环已达最大轮次限制',
            };
          }
          return copy;
        });
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        const errMsg = e instanceof Error ? e.message : '网络请求发生未知异常';
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              content: last.content
                ? `${last.content}\n\n[请求失败: ${errMsg}]`
                : `[请求失败: ${errMsg}]`,
            };
          }
          return copy;
        });
      }
    } finally {
      setBusy(false);
      consumerRef.current = null;
      abortRef.current = null;
    }
  }

  function handleStop() {
    consumerRef.current?.abort();
    abortRef.current?.abort();
  }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <h1>W3 · AI Agent 工具调用实战</h1>
      <p style={{ color: '#666', fontSize: 14 }}>
        基于 W2 流式解析引擎 + Function Calling 工具调用。内置 3 个工具：🌤️ 天气查询（模拟）· 📦 npm 包查询（真实 API）· 🧮 计算器（本地执行）
      </p>

      {/* W2 已有：深度思维链展示面板 (针对 DeepSeek R1 等推理流) */}
      {thinking && (
        <details open style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: 13, fontWeight: 'bold' }}>
            💭 DeepSeek 深度思考过程 (流式输出中...)
          </summary>
          <div style={{ color: '#475569', fontSize: 13, marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {thinking}
          </div>
        </details>
      )}

      {/* 消息对话列表 */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, minHeight: 300, padding: 16, marginBottom: 16 }}>
        {messages.length === 0 && (
          <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 80 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
            <div>试试问我：</div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 2 }}>
              「北京今天天气怎么样」<br />
              「查一下 react 这个 npm 包的信息」<br />
              「123 乘以 456 等于多少」
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 16 }}>
            {/* 消息角色标签 */}
            <div style={{
              fontSize: 12, fontWeight: 'bold', marginBottom: 4,
              color: m.role === 'user' ? '#2563eb' : '#059669',
            }}>
              {m.role === 'user' ? '👤 你' : '🤖 Agent'}
            </div>

            {/* W3 新增：工具调用状态可视化卡片 */}
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {m.toolCalls.map((tc) => (
                  <details
                    key={tc.id}
                    style={{
                      background: tc.status === 'executing' ? '#fefce8' : '#f0fdf4',
                      border: `1px solid ${tc.status === 'executing' ? '#fde047' : '#86efac'}`,
                      borderRadius: 6, padding: '8px 12px', marginBottom: 6,
                    }}
                  >
                    <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                      {tc.status === 'executing' ? '🔄' : '✅'}{' '}
                      工具调用: <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: 3 }}>{tc.name}</code>
                      {tc.status === 'executing' && <span style={{ color: '#ca8a04', marginLeft: 8 }}>执行中...</span>}
                    </summary>
                    <div style={{ marginTop: 8, fontSize: 12 }}>
                      <div style={{ color: '#64748b', marginBottom: 4 }}>参数：</div>
                      <pre style={{
                        background: '#f8fafc', padding: 8, borderRadius: 4,
                        overflow: 'auto', fontSize: 11, margin: 0,
                      }}>
                        {JSON.stringify(tc.args, null, 2)}
                      </pre>
                      {tc.status === 'done' && tc.result !== undefined ? (
                        <>
                          <div style={{ color: '#64748b', marginBottom: 4, marginTop: 8 }}>结果：</div>
                          <pre style={{
                            background: '#f0fdf4', padding: 8, borderRadius: 4,
                            overflow: 'auto', fontSize: 11, margin: 0,
                          }}>
                            {JSON.stringify(tc.result, null, 2)}
                          </pre>
                        </>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            )}

            {/* 消息文本内容 */}
            {m.content ? (
              <div style={{
                display: 'inline-block', padding: '8px 14px', borderRadius: 8,
                background: m.role === 'user' ? '#2563eb' : '#f1f5f9',
                color: m.role === 'user' ? '#fff' : '#0f172a',
                whiteSpace: 'pre-wrap', maxWidth: '85%',
              }}>
                {m.content}
              </div>
            ) : (
              m.role === 'assistant' && busy && (
                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                  {m.toolCalls && m.toolCalls.length > 0
                    ? '🔧 工具执行完毕，等待 Agent 整理回答...'
                    : '⏳ 思考中...'}
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {/* W2 已有：输入与控制栏 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          value={input}
          placeholder="输入消息，体验 AI Agent 工具调用..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={busy}
        />
        {busy ? (
          <button style={{ padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={handleStop}>
            停止
          </button>
        ) : (
          <button style={{ padding: '10px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={handleSend}>
            发送
          </button>
        )}
      </div>
    </main>
  );
}
