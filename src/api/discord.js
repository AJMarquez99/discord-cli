import { DiscordApiError } from '../lib/errors.js';
import { VERSION } from '../version.js';

const API_BASE = 'https://discord.com/api/v10';
const MAX_RETRIES = 2;

/**
 * Minimal Discord REST client over fetch. Adds Bot auth, retries 429 honoring Retry-After,
 * parses JSON, and surfaces non-OK responses as DiscordApiError. fetchImpl/sleep are
 * injectable for tests.
 */
export function createDiscordClient(creds, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const headers = {
    Authorization: `Bot ${creds.botToken}`,
    'Content-Type': 'application/json',
    'User-Agent': `discord-cli (https://github.com/AJMarquez99/discord-cli, ${VERSION})`,
  };

  async function request(method, path, { body, query } = {}) {
    let url = API_BASE + path;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ).toString();
      if (qs) url += `?${qs}`;
    }
    const init = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, init);
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after')) || 1;
        await sleep(retryAfter * 1000);
        continue;
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new DiscordApiError(res.status, data);
      return data;
    }
  }

  return {
    getMe: () => request('GET', '/users/@me'),
    getChannel: (channelId) => request('GET', `/channels/${channelId}`),
    getGuildChannels: (guildId) => request('GET', `/guilds/${guildId}/channels`),
    getMessages: (channelId, { limit, before, after } = {}) =>
      request('GET', `/channels/${channelId}/messages`, { query: { limit, before, after } }),
    createMessage: (channelId, payload) =>
      request('POST', `/channels/${channelId}/messages`, { body: payload }),
    addReaction: (channelId, messageId, emoji) =>
      request('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`),
    startThreadFromMessage: (channelId, messageId, payload) =>
      request('POST', `/channels/${channelId}/messages/${messageId}/threads`, { body: payload }),
  };
}
