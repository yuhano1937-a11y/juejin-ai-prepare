# 项目规则（RULES）

> 本文件定义本项目的强制约定。任何 AI 编码助手（Cursor / Windsurf / Claude / Copilot）与本仓库协作前先读此文件。

## 1. 技术栈
- 框架：Next.js 14（App Router）+ React 18 + TypeScript（strict）
- 包管理：npm
- 样式：CSS Modules / 全局 CSS，不引 UI 框架

## 2. 目录结构
```
app/
  api/<功能>/route.ts   # 服务端接口（唯一允许读 env Key 的地方）
  page.tsx              # 页面
  layout.tsx
  globals.css
scripts/                # 本地联调脚本，*.mjs，零 SDK 依赖
```
- 新增接口一律放 `app/api/*/route.ts`，**禁止**在客户端代码里直接请求大模型。

## 3. 命名
- 组件/文件：`kebab-case` 或 `PascalCase`（组件用 Pascal）
- 变量/函数：`camelCase`
- 常量：`UPPER_SNAKE_CASE`
- 类型：`PascalCase`，前缀 `T`（如 `TMessage`）

## 4. 组件规范
- 客户端组件顶部必须 `'use client'`
- 所有用户侧状态用 `useState`/`useRef`，流式读取用 `ReadableStream + TextDecoder`
- 异常处理：所有 fetch 必须有 try/catch + 用户可见的错误提示，禁止吞错

## 5. AI 集成红线（最高优先级）
1. **API Key 只存在于 `.env.local`，只在 `app/api/*/route.ts` 服务端读取**，前端代码不得出现 Key 字面量，也不得把 Key 透传前端。
2. 调用大模型必须 `stream: true`，前端用流式渲染（打字机），非流式仅用于脚本调试。
3. 中止必须前后端联动：前端 `AbortController` + 服务端 `req.signal` 透传给上游 fetch。
4. 流式响应头必须带 `X-Accel-Buffering: no`，避免反向代理缓冲成假流式。
5. 任何第三方工具/Schema 描述用中文写清用途与参数，方便模型正确调用。

## 6. 提交规范
- 提交信息：`type: 简述`（feat / fix / refactor / docs / chore）
- 禁止提交 `.env.local`、`node_modules`、`.next`
- 每个可演示能力完成即提交一次，保持小步提交
