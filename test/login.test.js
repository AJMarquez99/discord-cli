import { describe, it, expect, vi } from 'vitest';
import { runLogin } from '../src/commands/login.js';
import { InvalidInputError } from '../src/lib/errors.js';

function deps({ exists = false, token = 'my-bot-token' } = {}) {
  return {
    env: { HOME: '/h' },
    fileExists: vi.fn(() => exists),
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    promptHidden: vi.fn(async () => token),
  };
}

const CREDS = '/h/.config/discord-cli/credentials.json';

describe('runLogin', () => {
  it('prompts (hidden) for the bot token and writes credentials.json at 0600', async () => {
    const d = deps();
    const out = await runLogin({}, d);

    expect(d.promptHidden).toHaveBeenCalled();
    const [path, content, mode] = d.writeFile.mock.calls[0];
    expect(path).toBe(CREDS);
    expect(JSON.parse(content)).toEqual({ botToken: 'my-bot-token' });
    expect(mode).toBe(0o600);
    expect(d.ensureDir).toHaveBeenCalledWith('/h/.config/discord-cli');
    expect(out).toEqual({ path: CREDS, written: true });
  });

  it('trims surrounding whitespace from the token', async () => {
    const d = deps({ token: '  my-bot-token  ' });
    await runLogin({}, d);
    expect(JSON.parse(d.writeFile.mock.calls[0][1]).botToken).toBe('my-bot-token');
  });

  it('refuses to overwrite existing credentials without --force', async () => {
    const d = deps({ exists: true });
    await expect(runLogin({}, d)).rejects.toThrow(InvalidInputError);
    expect(d.writeFile).not.toHaveBeenCalled();
  });

  it('overwrites when --force is set', async () => {
    const d = deps({ exists: true });
    await runLogin({ force: true }, d);
    expect(d.writeFile).toHaveBeenCalled();
  });

  it('rejects an empty token', async () => {
    const d = deps({ token: '   ' });
    await expect(runLogin({}, d)).rejects.toThrow(InvalidInputError);
    expect(d.writeFile).not.toHaveBeenCalled();
  });
});
