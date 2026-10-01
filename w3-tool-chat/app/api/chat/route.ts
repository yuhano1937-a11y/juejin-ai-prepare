/**
 * @file route.ts
 * @description 服务端 Route Handler：代理转发大模型流式请求
 *
 * W3 升级点（相比 W2，仅新增 4 行）：
 * - 接收前端传来的 enableTools 标志
 * - 当启用工具时，将注册中心的 tools JSON Schema 注入上游请求
 * - 其余逻辑与 W2 完全一致：stream: true + SSE 透传
 */

import { NextRequest } from 'next/server';
import { ToolRegistry } from '@/lib/agent/tool-registry';
import { weatherTool } from '@/lib/agent/tools/weather';
import { npmSearchTool } from '@/lib/agent/tools/npm-search';
import { calculatorTool } from '@/lib/agent/tools/calculator';

export const runtime = 'nodejs'; // 保证原生 Node.js 流式性能
export const dynamic = 'force-dynamic';

/** W3 新增：初始化工具注册中心（服务端单例） */
const registry = new ToolRegistry();
registry.register(weatherTool);
registry.register(npmSearchTool);
registry.register(calculatorTool);

export async function POST(req: NextRequest) {
  const { messages, enableTools } = await req.json();

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

  // 构建上游请求体（W2 原有逻辑）
  const upstreamBody: Record<string, unknown> = {
    model,
    messages,
    stream: true, // 始终流式，这是 W2 流式架构的根基
  };

  // ========== W3 新增：4 行代码 ==========
  // 当前端开启工具模式时，将工具 JSON Schema 注入上游请求
  if (enableTools) {
    upstreamBody.tools = registry.getOpenAITools();
    upstreamBody.tool_choice = 'auto';
  }
  // ========================================

  // W2 原有逻辑：服务端转发大模型，支持 20+ 兼容端点
  const upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(upstreamBody),
    signal: req.signal, // 双向 Abort 联动：前端点"停止"，上游连接立刻被掐断，节省 Token
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

  // W2 原有逻辑：透传 SSE 二进制流，配置 X-Accel-Buffering 杜绝 Nginx 缓存
  return new Response(upstreamRes.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
