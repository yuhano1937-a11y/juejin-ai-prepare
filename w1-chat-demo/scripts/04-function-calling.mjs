// 运行：node --env-file=.env.local scripts/04-function-calling.mjs
// Function Calling：模型只"产出调用意图"，真正执行代码在我们手里（Agent 的基石）
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询某城市天气',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string', description: '城市名' } },
        required: ['city'],
      },
    },
  },
];

const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL,
    tools,
    messages: [{ role: 'user', content: '北京今天天气怎么样？' }],
  }),
});

const msg = res.json ? (await res.json()).choices[0].message : null;
if (msg?.tool_calls?.length) {
  const call = msg.tool_calls[0].function;
  console.log('模型想调用:', call.name, JSON.parse(call.arguments));
  // ← 这里才是我们真正执行工具的地方（查数据库 / 调 API / 算数）
  console.log('（示例）执行 get_weather(' + JSON.parse(call.arguments).city + ') → 晴 12℃');
}
