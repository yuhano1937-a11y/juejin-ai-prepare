/**
 * @file route.ts (api/tools)
 * @description W3 新增：工具执行端点
 *
 * 职责：接收前端传来的完整工具调用列表，通过 ToolRegistry 并行执行，返回结果
 * 设计考量：
 * - 工具执行放在服务端（而非前端），因为生产环境中工具可能涉及敏感操作（数据库、内网 API）
 * - 并行执行所有工具（Promise.all），最大化利用 I/O 并发
 * - 异常不抛出而是包装为 { error: "..." }，让 LLM 自省重试
 */

import { NextRequest } from 'next/server';
import { ToolRegistry } from '@/lib/agent/tool-registry';
import { weatherTool } from '@/lib/agent/tools/weather';
import { npmSearchTool } from '@/lib/agent/tools/npm-search';
import { calculatorTool } from '@/lib/agent/tools/calculator';

export const runtime = 'nodejs';

/** 复用与 /api/chat 相同的工具注册中心 */
const registry = new ToolRegistry();
registry.register(weatherTool);
registry.register(npmSearchTool);
registry.register(calculatorTool);

/** 工具调用请求体类型 */
interface ToolCallRequest {
  id: string;
  name: string;
  arguments: string;
}

export async function POST(req: NextRequest) {
  let body: { calls?: ToolCallRequest[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: '请求体 JSON 解析失败' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const calls = body.calls ?? [];
  if (calls.length === 0) {
    return new Response(
      JSON.stringify({ error: '未提供工具调用列表' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 并行执行所有工具调用
  const results = await Promise.all(
    calls.map(async (call) => {
      const resultStr = await registry.execute(call.name, call.arguments);
      return {
        tool_call_id: call.id,
        name: call.name,
        content: resultStr,
      };
    })
  );

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
