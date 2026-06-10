import { describe, it, expect, vi } from 'vitest';
import { runAudit } from '../src/commands/audit.js';

describe('runAudit', () => {
  it('passes a default limit of 20 to readAudit', async () => {
    const readAudit = vi.fn().mockReturnValue({ entries: [] });
    await runAudit({}, { readAudit });
    expect(readAudit).toHaveBeenCalledWith({ limit: 20 });
  });

  it('passes a parsed --limit', async () => {
    const readAudit = vi.fn().mockReturnValue({ entries: [] });
    await runAudit({ limit: '5' }, { readAudit });
    expect(readAudit).toHaveBeenCalledWith({ limit: 5 });
  });

  it('floors an invalid limit to 20', async () => {
    const readAudit = vi.fn().mockReturnValue({ entries: [] });
    await runAudit({ limit: 'abc' }, { readAudit });
    expect(readAudit).toHaveBeenCalledWith({ limit: 20 });
  });

  it('returns the entries from readAudit', async () => {
    const entries = [{ ts: 't', action: 'post', channelId: '1', messageId: '9', mode: 'restricted' }];
    const r = await runAudit({}, { readAudit: () => ({ entries }) });
    expect(r).toEqual({ entries });
  });
});
