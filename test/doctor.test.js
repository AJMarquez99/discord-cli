import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/commands/doctor.js';
import { MissingCredentialsError, MalformedConfigError } from '../src/lib/errors.js';

const baseDeps = (over = {}) => ({
  loadAllowlist: () => ({ channels: [{ channelId: '1' }, { channelId: '2' }] }),
  resolveCredentials: () => ({ botToken: 'tok', source: 'env' }),
  createClient: () => ({ getMe: async () => ({ id: '7', username: 'mybot' }) }),
  ...over,
});

describe('runDoctor', () => {
  it('reports ok with bot identity and allowlist count', async () => {
    const r = await runDoctor({}, baseDeps());
    expect(r.ok).toBe(true);
    expect(r.bot).toBe('mybot');
    expect(r.botId).toBe('7');
    expect(r.allowlist).toBe(2);
  });

  it('reports missing credentials without throwing', async () => {
    const r = await runDoctor({}, baseDeps({
      resolveCredentials: () => { throw new MissingCredentialsError('/c.json'); },
    }));
    expect(r.ok).toBe(false);
    expect(r.credentials).toBe('missing');
    expect(r.api).toBe('skipped');
  });

  it('reports an API failure without throwing', async () => {
    const r = await runDoctor({}, baseDeps({
      createClient: () => ({ getMe: async () => { throw new Error('401 Unauthorized'); } }),
    }));
    expect(r.ok).toBe(false);
    expect(r.credentials).toBe('ok');
    expect(r.api).toContain('401');
  });

  it('a malformed allowlist does not crash doctor (reports allowlist 0)', async () => {
    const r = await runDoctor({}, baseDeps({
      loadAllowlist: () => { throw new MalformedConfigError('/a.json', 'bad'); },
    }));
    expect(r).toBeDefined();
    expect(r.allowlist).toBe(0);
  });

  it('a malformed credentials file returns ok:false with credentials:malformed', async () => {
    const r = await runDoctor({}, baseDeps({
      resolveCredentials: () => { throw new MalformedConfigError('/c.json', 'bad'); },
    }));
    expect(r.ok).toBe(false);
    expect(r.credentials).toBe('malformed');
    expect(r.api).toBe('skipped');
  });
});
