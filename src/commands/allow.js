// Read-only view of the channel allowlist. Editing is done by hand in the JSON file.
export async function runAllowList(opts, deps) {
  const { channels } = deps.loadAllowlist();
  const normalized = channels
    .filter((c) => c && c.channelId)
    .map((c) => ({ alias: c.alias || null, channelId: String(c.channelId), serverId: c.serverId || null }));
  return { count: normalized.length, channels: normalized };
}
