import { describe, it, expect, vi } from 'vitest';
import { createDiscordClient } from '../src/api/discord.js';
import { DiscordApiError } from '../src/lib/errors.js';

// Build a fake fetch returning a Response-like object.
function fakeRes({ status = 200, json = null, headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => (json == null ? '' : JSON.stringify(json)),
  };
}

const creds = { botToken: 'tok' };

describe('createDiscordClient', () => {
  it('sends Bot auth and parses JSON on getMe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ json: { id: '1', username: 'bot' } }));
    const client = createDiscordClient(creds, { fetchImpl });
    const me = await client.getMe();
    expect(me.username).toBe('bot');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/users/@me');
    expect(init.headers.Authorization).toBe('Bot tok');
  });

  it('createMessage POSTs the payload as JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ json: { id: '99', content: 'hi' } }));
    const client = createDiscordClient(creds, { fetchImpl });
    const msg = await client.createMessage('123', { content: 'hi' });
    expect(msg.id).toBe('99');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/channels/123/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ content: 'hi' });
  });

  it('getMessages maps limit/before/after to query params and drops nullish', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ json: [] }));
    const client = createDiscordClient(creds, { fetchImpl });
    await client.getMessages('123', { limit: 5, before: 'abc', after: undefined });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/channels/123/messages?limit=5&before=abc');
  });

  it('addReaction URL-encodes the emoji and targets @me', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ status: 204 }));
    const client = createDiscordClient(creds, { fetchImpl });
    await client.addReaction('123', '456', '👍');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(url).toBe(`https://discord.com/api/v10/channels/123/messages/456/reactions/${encodeURIComponent('👍')}/@me`);
  });

  it('retries once on 429 honoring retry-after, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeRes({ status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(fakeRes({ json: { id: '1', username: 'bot' } }));
    const sleep = vi.fn().mockResolvedValue();
    const client = createDiscordClient(creds, { fetchImpl, sleep });
    const me = await client.getMe();
    expect(me.username).toBe('bot');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('throws DiscordApiError on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ status: 403, json: { message: 'Missing Permissions', code: 50013 } }));
    const client = createDiscordClient(creds, { fetchImpl });
    await expect(client.getMe()).rejects.toBeInstanceOf(DiscordApiError);
  });
});
