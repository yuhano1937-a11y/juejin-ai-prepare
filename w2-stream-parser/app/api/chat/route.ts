import { NextRequest } from 'next/server';

export const runtime = 'nodejs'; // 保证原生 Node.js 流式性能
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: '服务端未配置 OPENAI_API_KEY，请在 .env.local 中配置（若使用本地 Ollama/vLLM 可随意填写，如 ollama）',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 服务端转发大模型：支持 OpenAI、DeepSeek、通义千问、智谱清言及本地 Ollama 等所有兼容端点
  const upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal: req.signal, // 双向 Abort 联动：前端点“停止”，上游连接立刻被掐断，节省 Token
  });

  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: `上游模型接口错误 (${upstreamRes.status}): ${errText}` }),
      {
        status: upstreamRes.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 透传 SSE 二进制流，配置 X-Accel-Buffering 杜绝 Nginx 缓存
  return new Response(upstreamRes.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
