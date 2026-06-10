// Build a Discord allowed_mentions object. Default suppresses @everyone/@here and role pings
// (only user mentions resolve); opt back in per call. On a reply, ping the replied-to user.
export function buildAllowedMentions({ allowEveryone = false, allowRoles = false, isReply = false } = {}) {
  const parse = ['users'];
  if (allowEveryone) parse.push('everyone');
  if (allowRoles) parse.push('roles');
  const out = { parse };
  if (isReply) out.replied_user = true;
  return out;
}
