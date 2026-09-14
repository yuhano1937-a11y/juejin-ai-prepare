// 运行：node --env-file=.env.local scripts/05-multiturn.mjs
// 多轮：维护 messages 数组，演示"上下文窗口"是怎么累积的
let messages = [{ role: 'user', content: '记住：我的幸运数字是 7' }];

for (const q of ['我的幸运数字是多少？', '那它加 3 等于几？']) {
  messages.push({ role: 'user', content: q });
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL, messages }),
  });
  const reply = (await res.json()).choices[0].message;
  console.log('Q:', q, '\nA:', reply.content, '\n');
  messages.push(reply); // 把助手回复也塞回上下文，下一轮才"记得"
}
