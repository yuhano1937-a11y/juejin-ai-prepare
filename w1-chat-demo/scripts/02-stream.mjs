// 运行：node --env-file=.env.local scripts/02-stream.mjs
// 流式：用 ReadableStream 逐块读，体验"真流式"打字机
const res = await fetch(`${process.env.OPENAI_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL,
    stream: true,
    messages: [{ role: 'user', content: '用三句话讲讲 Temperature 和 Top-p 的区别' }],
  }),
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let full = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const events = buffer.split('\n\n');
  buffer = events.pop() ?? '';
  for (const evt of events) {
    const line = evt.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;
    const json = JSON.parse(data);
    const delta = json.choices?.[0]?.delta?.content ?? '';
    full += delta;
    process.stdout.write(delta); // 逐字输出 = 打字机
  }
}
console.log('\n\n[完整长度]', full.length);
