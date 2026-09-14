// 运行：node --env-file=.env.local scripts/06-params-demo.mjs
// 直观感受 Temperature / Top-p 对"随机性"的影响
async function ask(temp, topP) {
  const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      temperature: temp,
      top_p: topP,
      messages: [{ role: 'user', content: '给这款咖啡起一个品牌名' }],
    }),
  });
  return (await res.json()).choices[0].message.content;
}

console.log('低温 0.2 / top_p 0.1:', await ask(0.2, 0.1));
console.log('高温 1.2 / top_p 0.95:', await ask(1.2, 0.95));
// 多跑几次 06，观察同一 prompt 在不同参数下出名的差异 —— 凑满 10+ 次运行就靠它
