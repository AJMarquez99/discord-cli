export function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function formatPost(r) {
  if (r.dryRun) {
    if (r.blocked) return `DRY RUN — would be BLOCKED: ${r.reason}`;
    return [`DRY RUN — would post → channel ${r.targetChannelId}`, `content: ${r.content}`,
      r.replyTo ? `reply-to: ${r.replyTo}` : null].filter(Boolean).join('\n');
  }
  return [`posted → channel ${r.channelId}`, `message-id: ${r.messageId}`,
    r.replyTo ? `reply-to: ${r.replyTo}` : null].filter(Boolean).join('\n');
}

export function formatRead(r) {
  if (!r.messages || !r.messages.length) return `(no messages in channel ${r.channelId})`;
  return r.messages
    .map((m) => `${m.timestamp}  ${m.author || '(unknown)'}: ${m.content || '(no content)'}`)
    .join('\n');
}

export function formatReact(r) {
  if (r.dryRun) {
    if (r.blocked) return `DRY RUN — would be BLOCKED: ${r.reason}`;
    return `DRY RUN — would react ${r.emoji} → message ${r.messageId} in channel ${r.targetChannelId}`;
  }
  return `reacted ${r.emoji} → message ${r.messageId} in channel ${r.channelId}`;
}

export function formatThread(r) {
  if (r.dryRun) {
    if (r.blocked) return `DRY RUN — would be BLOCKED: ${r.reason}`;
    return `DRY RUN — would create thread "${r.name}" from message ${r.from} under channel ${r.parentChannelId}`;
  }
  return `thread created: ${r.name || '(unnamed)'} (${r.threadId}) under channel ${r.parentChannelId}`;
}

export function formatAllowList(r) {
  if (!r.channelCount && !r.serverCount) return '(allowlist empty — no channels or servers configured)';
  const lines = [`channels (${r.channelCount}):`];
  for (const id of r.channels) lines.push(`  ${id}`);
  lines.push(`servers (${r.serverCount}):`);
  for (const id of r.servers) lines.push(`  ${id}`);
  return lines.join('\n');
}

export function formatChannels(r) {
  if (!r.channels.length) return `(no channels visible in server ${r.serverId})`;
  return r.channels
    .map((c) => `${c.allowlisted ? '*' : ' '} ${c.name}  ${c.id}  (${c.type})`)
    .join('\n');
}

export function formatAudit(r) {
  if (!r.entries.length) return '(no audited actions yet)';
  return r.entries
    .map((e) => {
      const parts = [e.ts, e.action, `ch ${e.channelId}`];
      if (e.messageId) parts.push(`msg ${e.messageId}`);
      if (e.threadId) parts.push(`thread ${e.threadId}`);
      if (e.emoji) parts.push(e.emoji);
      parts.push(`[${e.mode}]`);
      return parts.join('  ');
    })
    .join('\n');
}

function doctorModeLine(r) {
  if (r.mode === 'open') {
    return r.servers > 0
      ? `OPEN — writes to any visible channel in ${r.servers} allowed server(s)`
      : `OPEN — no servers allowlisted, so only the ${r.allowlist} allowlisted channel(s) are writable`;
  }
  return 'restricted (allowlisted channels only)';
}

export function formatDoctor(r) {
  const lines = [
    `status:      ${r.ok ? 'ok' : 'FAILED'}`,
    `bot:         ${r.bot || '(unknown)'}${r.botId ? '  (' + r.botId + ')' : ''}`,
    `source:      ${r.source || '(none)'}`,
    `credentials: ${r.credentials || '(unknown)'}`,
    `api:         ${r.api || '(unknown)'}`,
    `mode:        ${doctorModeLine(r)}`,
    `allowlist:   ${r.allowlist} channel(s)`,
    `servers:     ${r.servers}`,
  ];
  if (r.error) lines.push('', r.error);
  return lines.join('\n');
}
