export function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function formatPost(r) {
  return [`posted → channel ${r.channelId}`, `message-id: ${r.messageId}`, r.replyTo ? `reply-to: ${r.replyTo}` : null]
    .filter(Boolean)
    .join('\n');
}

export function formatRead(r) {
  if (!r.messages.length) return `(no messages in channel ${r.channelId})`;
  return r.messages
    .map((m) => `${m.timestamp}  ${m.author || '(unknown)'}: ${m.content || '(no content)'}`)
    .join('\n');
}

export function formatReact(r) {
  return `reacted ${r.emoji} → message ${r.messageId} in channel ${r.channelId}`;
}

export function formatThread(r) {
  return `thread created: ${r.name} (${r.threadId}) under channel ${r.parentChannelId}`;
}

export function formatAllowList(r) {
  if (r.count === 0) return '(allowlist empty — no channel can be posted to)';
  return r.channels
    .map((c) => `${c.alias ? c.alias + '  ' : ''}${c.channelId}${c.serverId ? '  (server ' + c.serverId + ')' : ''}`)
    .join('\n');
}

export function formatDoctor(r) {
  const lines = [
    `status:      ${r.ok ? 'ok' : 'FAILED'}`,
    `bot:         ${r.bot || '(unknown)'}${r.botId ? '  (' + r.botId + ')' : ''}`,
    `source:      ${r.source || '(none)'}`,
    `credentials: ${r.credentials}`,
    `api:         ${r.api}`,
    `allowlist:   ${r.allowlist} channel(s)`,
  ];
  if (r.error) lines.push('', r.error);
  return lines.join('\n');
}
