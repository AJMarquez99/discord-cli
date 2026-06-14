export const ALLOWLIST_TEMPLATE =
  JSON.stringify(
    {
      _comment:
        'Fail-closed: only the channel ids listed in "channels" can be posted/read/reacted to. Add Discord channel ids there. To allow a whole server in open mode, add its guild id to "servers". Find ids with `discord channels --server <guildId>`. This file is edited by hand.',
      channels: [],
      servers: [],
    },
    null,
    2,
  ) + '\n';

export const CONFIG_TEMPLATE =
  JSON.stringify(
    {
      _comment:
        'All fields optional. mode: "restricted" (default — allowlisted channels only) or "open" (any visible channel in an allowlisted server). auditLog.logBody: include message bodies in the audit log (default false).',
      mode: 'restricted',
      auditLog: {
        enabled: true,
        logBody: false,
      },
    },
    null,
    2,
  ) + '\n';
