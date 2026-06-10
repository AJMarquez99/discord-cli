import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveSettingsPath, loadConfig, resolveMode } from '../src/config.js';
import { MalformedConfigError } from '../src/lib/errors.js';

const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };

describe('resolveSettingsPath', () => {
  it('honors DISCORD_CLI_SETTINGS', () => {
    expect(resolveSettingsPath({ DISCORD_CLI_SETTINGS: '/x/c.json' })).toBe('/x/c.json');
  });
  it('defaults under ~/.config/discord-cli', () => {
    expect(resolveSettingsPath({ HOME: '/h' })).toBe('/h/.config/discord-cli/config.json');
  });
});

describe('loadConfig', () => {
  it('returns defaults when the file is missing', () => {
    expect(loadConfig({ env: { HOME: '/h' }, readFile: enoent }))
      .toEqual({ mode: 'restricted', auditLog: { enabled: true, logBody: false } });
  });
  it('returns defaults on an empty file', () => {
    expect(loadConfig({ env: { HOME: '/h' }, readFile: () => '   ' }).mode).toBe('restricted');
  });
  it('throws MalformedConfigError on bad JSON', () => {
    expect(() => loadConfig({ env: { HOME: '/h' }, readFile: () => '{ bad' })).toThrow(MalformedConfigError);
  });
  it('parses mode:open and audit prefs', () => {
    const c = loadConfig({ env: { HOME: '/h' }, readFile: () => JSON.stringify({ mode: 'open', auditLog: { enabled: false, logBody: true } }) });
    expect(c).toEqual({ mode: 'open', auditLog: { enabled: false, logBody: true } });
  });
  it('coerces an unknown mode to restricted and defaults audit fields', () => {
    const c = loadConfig({ env: { HOME: '/h' }, readFile: () => JSON.stringify({ mode: 'wild' }) });
    expect(c).toEqual({ mode: 'restricted', auditLog: { enabled: true, logBody: false } });
  });
});

describe('resolveMode', () => {
  it('unrestricted flag wins', () => {
    expect(resolveMode({ config: { mode: 'restricted' }, env: {}, unrestricted: true })).toBe('open');
  });
  it('DISCORD_MODE=open → open, DISCORD_MODE=restricted → restricted', () => {
    expect(resolveMode({ config: { mode: 'restricted' }, env: { DISCORD_MODE: 'open' } })).toBe('open');
    expect(resolveMode({ config: { mode: 'open' }, env: { DISCORD_MODE: 'restricted' } })).toBe('restricted');
  });
  it('falls back to config.mode', () => {
    expect(resolveMode({ config: { mode: 'open' }, env: {} })).toBe('open');
    expect(resolveMode({ config: { mode: 'restricted' }, env: {} })).toBe('restricted');
  });

  describe('DISCORD_MODE warning behavior', () => {
    let stderrSpy;
    afterEach(() => { stderrSpy && stderrSpy.mockRestore(); });

    it('invalid DISCORD_MODE returns restricted AND writes a stderr warning', () => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});
      const result = resolveMode({ config: { mode: 'restricted' }, env: { DISCORD_MODE: 'opne' } });
      expect(result).toBe('restricted');
      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(stderrSpy.mock.calls[0][0]).toContain('opne');
      expect(stderrSpy.mock.calls[0][0]).toContain('restricted');
    });

    it('DISCORD_MODE=restricted returns restricted with NO warning', () => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});
      const result = resolveMode({ config: { mode: 'open' }, env: { DISCORD_MODE: 'restricted' } });
      expect(result).toBe('restricted');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('DISCORD_MODE=open returns open with NO warning', () => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});
      const result = resolveMode({ config: { mode: 'restricted' }, env: { DISCORD_MODE: 'open' } });
      expect(result).toBe('open');
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });
});
