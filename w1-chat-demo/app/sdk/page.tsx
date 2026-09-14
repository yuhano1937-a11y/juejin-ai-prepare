'use client';

import { useChat } from '@ai-sdk/react';

export default function SdkChat() {
  // ① 用 status 代替已废弃的 isLoading
  const { messages, input, handleInputChange, handleSubmit, status, stop, error } =
    useChat({ api: '/api/chat-sdk' });

  // ② 是否正处于生成周期（等待首字 或 流式传输中）
  const isBusy = status === 'submitted' || status === 'streaming';

  return (
    <div className="wrap">
      <h1>W1 · 对照版 Chat（useChat / AI SDK）</h1>
      <div className="box">
        {messages.length === 0 && <div className="ai">这是 SDK 版。去首页 / 对比手写版，看两者打字机/停止/错误表现是否一致。</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : 'ai'}`}>{m.content}</div>
        ))}
        {/* 可根据 status === 'submitted' 精准展示等待思考提示 */}
        {status === 'submitted' && <div className="ai" style={{ opacity: 0.6 }}>AI 正在思考中…</div>}
        {error && <div className="ai">⚠️ 出错：{error.message}</div>}
      </div>
      <form className="row" onSubmit={handleSubmit}>
        <input
          value={input}
          placeholder="说点什么…"
          onChange={handleInputChange}
          disabled={status !== 'ready'}
        />
        {isBusy ? (
          <button type="button" className="stop" onClick={stop}>停止</button>
        ) : (
          <button type="submit">发送</button>
        )}
      </form>
      <div className="foot">
        返回手写版：<a href="/">/</a>
      </div>
    </div>
  );
}
