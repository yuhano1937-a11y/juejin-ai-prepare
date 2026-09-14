'use client';

import { useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const next: Message[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }];
    setMessages(next);
    setInput('');
    setBusy(true);

    // ① 前端永远只调自己的服务端 /api/chat，不持 Key
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(0, -1) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());

      // ② 手写流式消费：ReadableStream + TextDecoder(stream:true)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // ③ SSE 三步法：拼接 → 按 \n\n 切事件 → 残片存回 buffer（解决粘包/半包）
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const evt of events) {
          const line = evt.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta: string = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              // 每收到一个 token 就追加到最后一条 assistant 消息 → 真打字机
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + delta };
                return copy;
              });
            }
          } catch {
            /* 心跳 ":" 或分片不完整，忽略 */
          }
        }
      }
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name !== 'AbortError') {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: `⚠️ 出错：${err.message ?? String(e)}` };
          return copy;
        });
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort(); // 前端中止 → 请求断开 → 服务端 upstream 也随 req.signal 断开（真停止）
  }

  return (
    <div className="wrap">
      <h1>W1 · 最小闭环 Chat（手写 fetch 流式）</h1>
      <div className="box">
        {messages.length === 0 && <div className="ai">发条消息试试，观察打字机效果。Key 全程只在服务端。</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'me' : 'ai'}`}>{m.content}</div>
        ))}
      </div>
      <div className="row">
        <input
          value={input}
          placeholder="说点什么…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
        />
        {busy ? (
          <button className="stop" onClick={stop}>停止</button>
        ) : (
          <button onClick={send}>发送</button>
        )}
      </div>
      <div className="foot">
        对照练习：把本页的流式逻辑删掉，换成 Vercel AI SDK 的 <code>useChat()</code>，对比两者差异与取舍。
      </div>
    </div>
  );
}
