# W2 · 生产级大模型流式解析引擎 (w2-stream-parser)

本项目是一个基于现代 **Web Streams API** 与 **Next.js 14 (App Router)** 的生产级大模型流式解析与工程化落地演示项目。  
零第三方运行时依赖，内置 WHATWG 规范切分、中文字符截断防乱码、三大协议暗坑防御与 `requestAnimationFrame` 60fps 攒批平滑渲染。

> 📖 **完整实战与原理教程**：深入从零实现细节、底层通信机制与架构推导，请查阅 [TUTORIAL.md](./TUTORIAL.md)。

---

## 🚀 快速启动

### 1. 安装依赖

推荐使用 Node.js 18+ 环境：

```bash
npm install
# 或者使用 yarn / pnpm
# yarn install
# pnpm install
```

### 2. 配置环境变量

从示例环境变量复制一份 `.env.local`：

```bash
cp .env.example .env.local
```

打开 `.env.local`，填入对应的大模型接口配置（项目采用标准 OpenAI 兼容协议，支持自由切换厂商）：

```ini
# 必填：API Key（仅在服务端读取，绝对不进前端产物）
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 必填：接口 Base URL（末尾不需要带 /）
# - OpenAI 官方: https://api.openai.com/v1
# - DeepSeek: https://api.deepseek.com/v1
# - 通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1
# - 智谱 GLM: https://open.bigmodel.cn/api/paas/v4
# - 本地 Ollama (免费免 Key): http://localhost:11434/v1
OPENAI_BASE_URL=https://api.openai.com/v1

# 选填：模型标识（默认为 gpt-4o-mini）
OPENAI_MODEL=gpt-4o-mini
```

> 💡 **本地零成本跑通**：如果你本地安装了 [Ollama](https://ollama.com/)（如 `ollama run deepseek-r1:1.5b`），可配置 `OPENAI_BASE_URL=http://localhost:11434/v1`，`OPENAI_API_KEY=ollama`，无需消耗任何 API Token 额度。

### 3. 启动开发服务器

```bash
npm run dev
```

启动成功后，使用浏览器打开 [http://localhost:3000](http://localhost:3000) 即可体验：
- 极速流式打字机效果（60fps 无掉帧平滑渲染）
- 深度思考模型（如 DeepSeek R1）的思维链（Reasoning）独立面板实时折叠展示
- 前后端双向中断（点击“停止”即刻切断上游连接，停止计费）

---

## 🧪 单元测试

本项目基于 **Vitest** 实现了严苛的 TDD 自动化测试套件，全面覆盖网络粘包、半包切分、跨分片 UTF-8 乱码修复及厂商协议暗坑：

```bash
npm test
```

包含测试覆盖：
- `byte-to-text.test.ts`：跨分片多字节中文截断解码、UTF-8 BOM 自动剥离
- `sse-split.test.ts`：CRLF/CR/LF 多种行终止符、多行 `data` 合并、冒号注释与心跳包过滤
- `adapters.test.ts`：OpenAI 协议防 `[DONE]` 漏发、防 `content: null` 崩溃、计费字段别名合并、Claude 事件驱动状态机
- `token-batch.test.ts`：rAF 攒批与自然帧调度测试

---

## 📜 常用命令清单

| 命令 | 说明 |
| :--- | :--- |
| `npm run dev` | 启动本地 Next.js 开发服务器（默认端口 3000） |
| `npm test` | 运行 Vitest 单元测试套件（单次运行） |
| `npm run build` | 构建 Next.js 生产环境产物 |
| `npm run start` | 启动 Next.js 生产服务器 |
| `npm run lint` | 执行 ESLint 静态代码检查 |

---

## 📁 项目核心目录结构

```
w2-stream-parser/
├── lib/stream-parser/           # 核心流式解析引擎（高内聚、零运行时依赖，可单独发布为 npm 包）
│   ├── core/                    # 底层数据管道与调度
│   │   ├── types.ts             # 核心数据接口 (SSEEvent, TokenUsage 等)
│   │   ├── sse-parser.ts        # 管道入口 (createSSEStream, parseSSEStream)
│   │   └── transforms/
│   │       ├── byte-to-text.ts  # 转换流 1: 字节流安全解码 (TextDecoder stream:true + BOM 剥离)
│   │       ├── sse-split.ts     # 转换流 2: WHATWG 规范切分 (CRLF / 多行 data / 注释过滤)
│   │       └── token-batch.ts   # 转换流 3: Token 攒批器 (rAF 60fps 渲染调度)
│   ├── adapters/                # 多厂商协议归一化适配器
│   │   ├── adapter.ts           # 适配器接口与安全 JSON 解析
│   │   ├── openai.ts            # OpenAI 兼容协议适配（全防御型，支持思维链分流）
│   │   └── claude.ts            # Anthropic Claude 事件流适配
│   ├── consumer/                # 顶层消费客户端
│   │   └── stream-consumer.ts   # 适配器注册表与统一门面 (createStreamConsumer)
│   └── index.ts                 # 统一导出入口
├── app/                         # Next.js 14 App Router 演示落地
│   ├── api/chat/route.ts        # 服务端代理路由（Key 隔离与双向 Abort）
│   └── page.tsx                 # 客户端 UI 页面（打字机与思维链消费）
├── __tests__/                   # 严苛单元测试用例
├── .env.example                 # 环境变量模板
└── TUTORIAL.md                  # 深入原理与逐行手写完整实战教程
```

---

## 🛡️ 核心特性亮点

1. **零运行时外部依赖**：仅基于原生 Web Streams API（`TransformStream`、`TextDecoder`）构建；
2. **字符截断防乱码**：通过 `TextDecoder({ stream: true })` 状态机接管多字节 UTF-8 中文碎片，杜绝 `` 乱码；
3. **协议暗坑防御**：
   - 厂商漏发 `[DONE]` 时通过 `finish_reason` 主动双保险终结；
   - 过滤空值与 `null`，避免解包崩溃；
   - 自动映射国内大模型计费字段别名（`input_tokens` / `prompt_tokens`）；
4. **思维链双轨分流**：针对 DeepSeek R1 等推理模型，分离 `reasoning_content`，避免破坏正式答案；
5. **渲染性能优化**：使用 `requestAnimationFrame` 按帧攒批交付，彻底根治逐 token `setState` 导致的 DOM 重排卡死；
6. **全链路 Abort 联动**：前端用户点击“停止”，服务端即刻掐断上游大模型请求，避免无效消耗 Token。
