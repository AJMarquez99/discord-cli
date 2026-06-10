// Read-only view of the channel + server allowlist. Editing is done by hand in the JSON file.
export async function runAllowList(opts, deps) {
  const { channels, servers } = deps.loadAllowlist();
  return {
    channelCount: channels.length,
    channels: channels.slice(),
    serverCount: servers.length,
    servers: servers.slice(),
  };
}
