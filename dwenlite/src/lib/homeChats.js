// Saving a conversation compactly, and putting it back.
const clip = (t, n) => { const s = String(t == null ? '' : t); return s.length > n ? s.slice(0, n) + '...' : s; };

export function packChat(items, convo) {
  const keep = items.filter((i) => ['user', 'ai', 'action', 'plan', 'info'].includes(i.type)).map((i) => {
    if (i.type === 'user') return { id: i.id, type: 'user', text: clip(i.text, 4000) };
    if (i.type === 'ai') return { id: i.id, type: 'ai', content: clip(i.content, 12000) };
    if (i.type === 'plan') return { id: i.id, type: 'plan', steps: i.steps };
    if (i.type === 'info') return { id: i.id, type: 'info', text: clip(i.text, 300) };
    return { id: i.id, type: 'action', tool: i.tool, args: { ...i.args, content: i.args && i.args.content ? clip(i.args.content, 600) : undefined, code: i.args && i.args.code ? clip(i.args.code, 600) : undefined }, deviceName: i.deviceName, deviceId: i.deviceId, status: ['asking', 'running'].includes(i.status) ? 'error' : i.status, output: clip(i.output, 1500), preview: clip(i.preview, 1500), undone: i.undone, fileMeta: i.fileMeta };
  });
  let msgs = convo.map((m) => (m.role === 'user' ? { role: 'user', content: clip(m.content, 4000) }
    : m.role === 'assistant' ? { role: 'assistant', content: clip(m.content, 6000), ...(m.tool_calls ? { tool_calls: m.tool_calls.map((c) => ({ ...c, function: { ...c.function, arguments: clip(c.function.arguments, 1500) } })) } : {}) }
      : { role: 'tool', tool_call_id: m.tool_call_id, content: clip(m.content, 1500) }));
  let data = JSON.stringify({ v: 1, items: keep, convo: msgs });
  while (data.length > 640000 && msgs.length > 6) { msgs = msgs.slice(Math.ceil(msgs.length / 4)); while (msgs.length && msgs[0].role !== 'user') msgs.shift(); data = JSON.stringify({ v: 1, items: keep.slice(-80), convo: msgs }); }
  const users = keep.filter((i) => i.type === 'user'); const ais = keep.filter((i) => i.type === 'ai');
  return {
    data,
    title: clip((users[0] && users[0].text) || 'New chat', 70),
    preview: clip((ais[ais.length - 1] && ais[ais.length - 1].content) || (users[users.length - 1] && users[users.length - 1].text) || '', 150),
    search: clip(keep.filter((i) => i.type === 'user' || i.type === 'ai').map((i) => i.text || i.content).join(' '), 6000),
  };
}

export function unpackChat(json) {
  const d = JSON.parse(json);
  return { items: (d.items || []).map((i) => ({ ...i, typing: false })), convo: d.convo || [] };
}
