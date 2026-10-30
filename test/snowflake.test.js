import { describe, it, expect } from 'vitest';
import { snowflakeToIso } from '../src/lib/snowflake.js';

describe('snowflakeToIso', () => {
  it('decodes the timestamp from a snowflake (Discord docs example)', () => {
    expect(snowflakeToIso('175928847299117063')).toBe('2016-04-30T11:18:25.796Z');
  });

  it('returns null for null, undefined, or empty input', () => {
    expect(snowflakeToIso(null)).toBeNull();
    expect(snowflakeToIso(undefined)).toBeNull();
    expect(snowflakeToIso('')).toBeNull();
  });
});
