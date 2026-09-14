import { NextRequest } from 'next/server';

// 关键：跑在 Node 运行时，才能读 process.env 且用上 req.signal 做前后端联动中止
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return new Response('缺少 OPENAI_API_KEY，请在 .env.local 配置', { status: 500 });
  }

  // ① 服务端用 Key 转发给大模型 —— Key 从 process.env 读，永远不会出现在前端产物里
  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
    // ② 把客户端的中止信号透传给上游：前端点"停止"，上游请求也立刻断，这才是真停止
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return new Response(`上游错误 ${upstream.status}: ${text}`, { status: 502 });
  }

  // ③ 直接把上游的 SSE 字节流原样转给前端，保持"真流式"打字机效果
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // 反向代理（Nginx）不要缓冲，否则变假流式
    },
  });
}
