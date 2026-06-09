import { describe, it, expect } from 'vitest';
import {
  EXIT_CODES,
  DiscordError,
  MissingCredentialsError,
  InvalidInputError,
  ChannelNotAllowedError,
  DiscordApiError,
  MalformedConfigError,
} from '../src/lib/errors.js';

describe('errors', () => {
  it('exposes the exit-code table', () => {
    expect(EXIT_CODES).toEqual({ GENERIC: 1, CONFIG: 2, FORBIDDEN: 3 });
  });

  it('MissingCredentialsError is a CONFIG error mentioning the path', () => {
    const e = new MissingCredentialsError('/tmp/creds.json');
    expect(e).toBeInstanceOf(DiscordError);
    expect(e.exitCode).toBe(EXIT_CODES.CONFIG);
    expect(e.message).toContain('/tmp/creds.json');
    expect(e.message).toContain('DISCORD_BOT_TOKEN');
  });

  it('InvalidInputError is a CONFIG error', () => {
    expect(new InvalidInputError('bad').exitCode).toBe(EXIT_CODES.CONFIG);
  });

  it('ChannelNotAllowedError is FORBIDDEN and names the denied target', () => {
    const e = new ChannelNotAllowedError('random');
    expect(e.exitCode).toBe(EXIT_CODES.FORBIDDEN);
    expect(e.message).toContain('random');
    expect(e.denied).toBe('random');
  });

  it('DiscordApiError formats status + message + code and is GENERIC', () => {
    const e = new DiscordApiError(403, { message: 'Missing Permissions', code: 50013 });
    expect(e.exitCode).toBe(EXIT_CODES.GENERIC);
    expect(e.status).toBe(403);
    expect(e.message).toContain('403');
    expect(e.message).toContain('Missing Permissions');
    expect(e.message).toContain('50013');
  });

  it('MalformedConfigError is a CONFIG error and its message contains the path', () => {
    const e = new MalformedConfigError('/tmp/cfg.json', 'Unexpected token x');
    expect(e).toBeInstanceOf(DiscordError);
    expect(e.exitCode).toBe(EXIT_CODES.CONFIG);
    expect(e.message).toContain('/tmp/cfg.json');
    expect(e.path).toBe('/tmp/cfg.json');
  });
});
