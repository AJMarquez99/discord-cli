import { describe, it, expect } from 'vitest';
import { resolveCredentials, resolveConfigPath } from '../src/auth/credentials.js';
import { MissingCredentialsError } from '../src/lib/errors.js';

const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };

describe('resolveConfigPath', () => {
  it('honors DISCORD_CLI_CONFIG override', () => {
    expect(resolveConfigPath({ DISCORD_CLI_CONFIG: '/x/c.json' })).toBe('/x/c.json');
  });
  it('defaults under ~/.config/discord-cli', () => {
    expect(resolveConfigPath({ HOME: '/home/me' })).toBe('/home/me/.config/discord-cli/credentials.json');
  });
});

describe('resolveCredentials', () => {
  it('prefers DISCORD_BOT_TOKEN env over file', () => {
    const creds = resolveCredentials({ env: { DISCORD_BOT_TOKEN: 'tok-env' }, readFile: enoent });
    expect(creds).toEqual({ botToken: 'tok-env', source: 'env' });
  });

  it('reads botToken from the config file', () => {
    const creds = resolveCredentials({
      env: { HOME: '/home/me' },
      readFile: () => JSON.stringify({ botToken: 'tok-file' }),
    });
    expect(creds.botToken).toBe('tok-file');
    expect(creds.source).toBe('/home/me/.config/discord-cli/credentials.json');
  });

  it('throws MissingCredentialsError when the file is absent', () => {
    expect(() => resolveCredentials({ env: { HOME: '/home/me' }, readFile: enoent }))
      .toThrow(MissingCredentialsError);
  });

  it('throws MissingCredentialsError when the file lacks botToken', () => {
    expect(() => resolveCredentials({ env: { HOME: '/home/me' }, readFile: () => '{}' }))
      .toThrow(MissingCredentialsError);
  });
});
