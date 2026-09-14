# W1 · 环境 + 最小闭环

一个能演示、能讲原理的 Chat Demo：前端 → 调自己服务端 `/api/chat` → 服务端读 `process.env` 里的 Key 转发大模型 → 流式返回前端打字机渲染。**Key 全程不落前端。**

## 跑通步骤
```bash
cp .env.example .env.local      # 填入 OPENAI_API_KEY / OPENAI_BASE_URL / OPENAI_MODEL
npm install
npm run dev                     # 打开 http://localhost:3000 对话（手写版）
# 对照版在 http://localhost:3000/sdk （useChat / AI SDK）
# 差异笔记见 COMPARISON.md
```
联调脚本（M1，跑满 10+ 次）：
```bash
node --env-file=.env.local scripts/01-chat.mjs        # 基础对话
node --env-file=.env.local scripts/02-stream.mjs      # 流式
node --env-file=.env.local scripts/03-json-mode.mjs   # JSON Mode
node --env-file=.env.local scripts/04-function-calling.mjs  # Function Calling
node --env-file=.env.local scripts/05-multiturn.mjs   # 多轮上下文
node --env-file=.env.local scripts/06-params-demo.mjs  # 温度/Top-p 感受（多跑几次凑满 10+）
```

## M3 · 项目 Rules 文件
见 `RULES.md`（目录/命名/组件规范 + AI 集成红线：Key 只在服务端、强制流式、前后端联动中止）。

---

## 核心知识点（面试能脱稿讲）

### 1. Token —— 模型的"字"
- 不是按字符也不是按单词，是**子词（subword）**。中文约 1 字 ≈ 0.6~1.5 token，英文 1 词 ≈ 1.3 token。
- 计费、上下文窗口、限速都按 token 算。输入 + 输出一起算。
- 面试话术："Token 是模型的最小计费与计算单元。我们做前端要关心两点：一是长上下文会撑爆窗口和钱包，所以要做截断/摘要；二是流式渲染本质就是后端按 token 切片吐，前端逐片拼。"

### 2. Context Window（上下文窗口）
- 模型单次能"看到"的最大 token 数（如 8K / 32K / 128K）。
- 多轮对话把历史 messages 全塞进去，会**越聊越贵越慢**，还可能超窗。
- 工程对策：短期放最近 N 轮 + 中期摘要压缩 + 长期丢向量库检索。
- 面试话术："上下文窗口不是越大越好。我们会对超长历史做滑动窗口 + 摘要，必要时把早期内容转检索。前端要能展示'已折叠/已摘要'的状态，避免用户以为模型记得全部。"

### 3. Temperature（温度）
- 控制**随机性**。低（0.2）= 稳、准、重复；高（1.2）= 发散、有创意。
- 代码/抽取类用低（0.1~0.3），头脑风暴用高（0.8~1.2）。
- 面试话术："Temperature 调的是采样熵。生产里代码和抽取我默认 0.1~0.2 求稳；创意生成才上 1.0+。但它和 Top-p 二选一调就行，不要同时猛拉，否则行为难预测。"

### 4. Top-p（核采样）
- 不按固定数量，而是按**累积概率**取词：只从概率加起来达到 p 的最小词集合里采样。
- 比 Top-k 更动态：分布平就多选，分布尖就少选。
- 面试话术："Top-p 是核采样，按累积概率裁剪候选集，比 Top-k 更自适应。实际我用 Temperature 或 Top-p 其一即可，常规 0.9 左右；严格任务直接 0 或 0.1 走贪心。"

### 5. 三种 API 调用（M1 已跑）
- **基础对话**：一次性拿完整结果。
- **流式（stream:true）**：后端逐 token 吐 SSE，前端打字机——体验与成本最优，生产默认。
- **JSON Mode / Function Calling**：把"自然语言"变成"结构化数据"或"工具调用意图"，是 Agent 的入口。

### 6. 流式消费三步法（前端必会，见 app/page.tsx）
1. `res.body.getReader()` + `new TextDecoder({ stream: true })`；
2. 每片 `buffer += decode(value,{stream:true})`，按 `\n\n` 切事件；
3. 残片存回 `buffer`（解决**粘包/半包**），逐行找 `data: ` 解析，遇 `[DONE]` 结束。

### 7. Key 安全（红线，见 RULES.md）
- Key 只在 `app/api/*/route.ts` 服务端 `process.env` 读，**永远不进前端产物**。
- 验证方法：把 Key 故意写进前端再 `npm run build`，用 `grep -r "sk-" .next` 搜产物，能看到就说明泄露了——这就是"安全反射"练习。

### 8. 真停止 = 前后端联动中止
- 前端 `AbortController.abort()` 只断前端读取；**服务端必须把 `req.signal` 透传给上游 fetch**，上游请求才真正断开。否则后端还在烧 token。

---

## 验收（W1 出口标准）
- [ ] 不看笔记能讲清 Token / Context Window / Temperature / Top-p
- [ ] 四类脚本各跑通（对话/流式/JSON/FC），合计 10+ 次
- [ ] Chat 页面可演示流式打字 + 错误提示 + 停止
- [ ] 能说清"为什么 Key 不能放前端"并演示泄露路径
- [ ] **对照练习**：把手写版（`app/page.tsx`）与 `useChat` 版（`app/sdk/page.tsx`）都跑通，读 `COMPARISON.md`，能口述两者差异与协议坑
- [ ] RULES.md 落地，项目已提交 GitHub
