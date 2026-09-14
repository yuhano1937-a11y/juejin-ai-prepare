// 运行：node --env-file=.env.local scripts/03-json-mode.mjs
// JSON Mode：强制模型只输出可解析 JSON（结构化抽取 / 分类场景必备）
const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '只输出 JSON，字段: city(城市), mood(情绪), tags(数组)' },
      { role: 'user', content: '今天北京下雪了，我特别开心，想去滑雪和吃火锅' },
    ],
  }),
});

const json = await res.json();
const parsed = JSON.parse(json.choices[0].message.content);
console.log(parsed);
