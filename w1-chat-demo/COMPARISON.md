# 手写 fetch 流式 vs  useChat() 对照笔记

W1 的核心练习：先把流式消费手写一遍（懂原理），再换成官方 Hook（懂抽象）。两者功能等价，差异在"谁干活"。

## 文件对照
| 关注点 | 手写版 | useChat 版 |
|---|---|---|
| 入口页面 | `app/page.tsx`（路由 `/`） | `app/sdk/page.tsx`（路由 `/sdk`） |
| 服务端路由 | `app/api/chat/route.ts` | `app/api/chat-sdk/route.ts` |
| 前端状态 | 手写 `useState` messages | `useChat()` 自带 `messages` |
| 流式解析 | 手写 `getReader`+`TextDecoder`+`\n\n` 切分 | SDK 私有 Data Stream 协议自动解析 |
| 停止 | 手写 `AbortController` | `stop()`，底层同样透传 `abortSignal` |
| 错误 | 手写 try/catch + `setState` | 自带 `error` 字段 |
| 依赖 | 零额外依赖 | `ai` + `@ai-sdk/react` + `@ai-sdk/openai` |

## 服务端路由差异（最容易踩的坑）
手写版直接把上游「原生 OpenAI SSE 字节流」`return new Response(upstream.body, ...)` 透传；
useChat 版必须用 `streamText(...).toDataStreamResponse()` 把上游转成 **AI SDK 自己的协议**。
→ 所以「手写 fetch 直连 /api/chat-sdk」解析不了，因为协议不对。这正是抽象替你藏的那层。

```ts
// 手写版：透传原生 SSE
return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream' } });

// useChat 版：转成 SDK 协议
const result = streamText({ model, messages, abortSignal: req.signal });
return result.toDataStreamResponse();
```

## 前端代码量差异（手写 vs Hook）
```tsx
// 手写版：约 60 行，自己管 reader / decoder / buffer / 逐 token setState / catch
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const events = buffer.split('\n\n'); buffer = events.pop() ?? '';
  /* 解析 data: + JSON.parse + 累加 delta → setState */
}

// useChat 版：约 3 行把活全交出去
const { messages, input, handleInputChange, handleSubmit, isLoading, stop, error } =
  useChat({ api: '/api/chat-sdk' });
```

## 面试怎么讲（背这段就够）
"生产里我直接用 `useChat()`，因为它把消息状态、流式解析、错误、重连、停止全封装了，代码量降一个数量级。但我清楚它底下做了什么——**前端用 `ReadableStream`+`TextDecoder` 按 `\n\n` 切 SSE 事件、残片拼接防粘包半包、逐 token 追加 state；后端用 `streamText` 把上游转成 SDK 私有协议**。

我坚持手写一遍的原因：一是定制化场景（自定义协议、乐观更新、把工具调用结果内联渲染）得能改到底层；二是面试能讲清抽象替你藏了什么——会调 Hook 的人很多，知道它怎么流式解析的人少，这就是差异化。"

## 什么时候该手写、什么时候用 Hook
- **用 Hook**：标准聊天 UI、要快上线、需要内置的 reload/stop/error。默认选它。
- **手写**：要接管协议（如直接消费 OpenAI 原生流做自定义渲染）、要极致控制渲染节奏（rAF 攒批降重渲染）、或 SDK 版本不匹配上游格式时。
