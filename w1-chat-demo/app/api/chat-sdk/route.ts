import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { NextRequest } from 'next/server';

// 与手写版同一套安全原则：Key 只在服务端读 env，前端永远拿不到
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

  // 用 AI SDK 的工厂创建兼容 OpenAI 协议的 provider（DeepSeek/通义/智谱通用）
  const provider = createOpenAI({ apiKey, baseURL: baseUrl });

  // streamText 内部已封装：构造请求 → 读上游 SSE → 转成 SDK 私有数据流协议
  const result = streamText({
    model: provider(model),
    messages,
    abortSignal: req.signal, // 前端 useChat().stop() 会触发，实现前后端联动中止
  });

  // 关键差异：手写版直接透传上游「原生 OpenAI SSE」字节流；
  // 这里转成 AI SDK 自己的「Data Stream 协议」，useChat 才能解析
  return result.toDataStreamResponse();
}
