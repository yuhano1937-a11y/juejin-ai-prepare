'use client';

import { useRef, useState } from 'react';
import { createStreamConsumer, type StreamConsumerHandle } from '@/lib/stream-parser';

export default function ChatPage() {
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [thinking, setThinking] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const consumerRef = useRef<StreamConsumerHandle | null>(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setThinking('');
    setBusy(true);

    const abortController = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
        signal: abortController.signal,
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

      // 核心：使用手写的生产级流式消费客户端 (基于 OpenAI 兼容协议)
      const consumer = createStreamConsumer(res.body, {
        provider: 'openai',   // 支持中美 20+ 主流厂商别名 (含 DeepSeek, Qwen 等)
        batchStrategy: 'raf', // 开启 requestAnimationFrame 60fps 平滑攒批

        onToken: (tokenChunk) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + tokenChunk };
            return copy;
          });
        },

        onReasoning: (reasoningChunk) => {
          // DeepSeek R1 思维链独立渲染
          setThinking((prev) => prev + reasoningChunk);
        },

        onError: (err) => {
          console.error('流异常:', err);
        },
      });

      consumerRef.current = consumer;
      await consumer.done;
    } catch (e) {
      console.error(e);
      const errMsg = e instanceof Error ? e.message : '网络请求发生未知异常';
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant') {
          copy[copy.length - 1] = {
            ...last,
            content: last.content ? `${last.content}\n\n[请求失败: ${errMsg}]` : `[请求失败: ${errMsg}]`,
          };
        }
        return copy;
      });
    } finally {
      setBusy(false);
      consumerRef.current = null;
    }
  }

  function handleStop() {
    consumerRef.current?.abort();
  }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      <h1>W2 · 生产级流式解析落地实战</h1>
      <p style={{ color: '#666', fontSize: 14 }}>
        基于原生 Web Streams API、WHATWG 规范合规切分、4 大生产暗坑防御与 rAF 攒批 60fps 渲染。
      </p>

      {/* 深度思维链展示面板 (针对 DeepSeek R1 等推理流) */}
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
          <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 100 }}>
            输入消息体验平滑打字机效果...
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <span style={{
              display: 'inline-block',
              padding: '8px 14px',
              borderRadius: 8,
              background: m.role === 'user' ? '#2563eb' : '#f1f5f9',
              color: m.role === 'user' ? '#fff' : '#0f172a',
              whiteSpace: 'pre-wrap',
            }}>
              {m.content || (m.role === 'assistant' && busy ? '...' : '')}
            </span>
          </div>
        ))}
      </div>

      {/* 输入与控制栏 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          value={input}
          placeholder="输入消息，体验 60fps 平滑打字机与思考流..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          disabled={busy}
        />
        {busy ? (
          <button style={{ padding: '10px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={handleStop}>
            停止
          </button>
        ) : (
          <button style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={handleSend}>
            发送
          </button>
        )}
      </div>
    </main>
  );
}
