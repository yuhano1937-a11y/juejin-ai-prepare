// 运行：node --env-file=.env.local scripts/01-chat.mjs
// 最基础：一次对话，拿完整回复（非流式）
const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL,
    messages: [{ role: 'user', content: '用一句话解释什么是 Token' }],
  }),
});

const json = await res.json();
console.log('json', JSON.stringify(json));
console.log('→', json.choices[0].message.content);
console.log('token 用量:', json.usage);
