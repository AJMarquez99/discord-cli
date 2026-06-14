import { describe, it, expect, vi } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { MissingCredentialsError, MalformedConfigError } from '../src/lib/errors.js';
import { ALLOWLIST_TEMPLATE, CONFIG_TEMPLATE } from '../src/lib/templates.js';

// `exists` may be a boolean (applies to every path) or a Set of paths that exist.
function makeDeps({ exists = false, creds = 'missing' } = {}) {
  const existsFor = (p) => (exists instanceof Set ? exists.has(p) : exists);
  return {
    env: { HOME: '/h' },
    fileExists: vi.fn(existsFor),
    ensureDir: vi.fn(),
    writeFileIfAbsent: vi.fn(),
    resolveCredentials: vi.fn(() => {
      if (creds === 'ok') return { botToken: 'tok', source: 'env' };
      if (creds === 'malformed') throw new MalformedConfigError('/h/.config/discord-cli/credentials.json', 'bad');
      throw new MissingCredentialsError('/h/.config/discord-cli/credentials.json');
    }),
  };
}

const ALLOW = '/h/.config/discord-cli/allowlist.json';
const CONFIG = '/h/.config/discord-cli/config.json';

describe('runInit', () => {
  it('scaffolds when files are absent', async () => {
    const deps = makeDeps({ exists: false, creds: 'missing' });
    const result = await runInit({}, deps);

    expect(result.created).toContain(ALLOW);
    expect(result.created).toContain(CONFIG);
    expect(result.skipped).toHaveLength(0);

    expect(deps.ensureDir).toHaveBeenCalledWith('/h/.config/discord-cli');
    expect(deps.writeFileIfAbsent).toHaveBeenCalledWith(ALLOW, ALLOWLIST_TEMPLATE);
    expect(deps.writeFileIfAbsent).toHaveBeenCalledWith(CONFIG, CONFIG_TEMPLATE);
  });

  it('is non-clobbering / idempotent when files already exist', async () => {
    const deps = makeDeps({ exists: true, creds: 'ok' });
    const result = await runInit({}, deps);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toContain(ALLOW);
    expect(result.skipped).toContain(CONFIG);
  });

  it('scaffolds only the missing file when one already exists', async () => {
    const deps = makeDeps({ exists: new Set([ALLOW]), creds: 'ok' });
    const result = await runInit({}, deps);

    expect(result.created).toEqual([CONFIG]);
    expect(result.skipped).toEqual([ALLOW]);
  });

  it('reports credentials missing and includes the developer-portal URL in nextSteps', async () => {
    const deps = makeDeps({ exists: true, creds: 'missing' });
    const result = await runInit({}, deps);

    expect(result.credentials).toBe('missing');
    const allSteps = result.nextSteps.join(' ');
    expect(allSteps).toContain('discord.com/developers/applications');
    expect(allSteps).toContain('discord login');
  });

  it('reports credentials ok when resolveCredentials succeeds', async () => {
    const deps = makeDeps({ exists: true, creds: 'ok' });
    const result = await runInit({}, deps);

    expect(result.credentials).toBe('ok');
  });

  it('tolerates a malformed credentials file (reports malformed, does not throw)', async () => {
    const deps = makeDeps({ exists: true, creds: 'malformed' });
    const result = await runInit({}, deps);

    expect(result.credentials).toBe('malformed');
  });
});
