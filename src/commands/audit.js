// Read-only view of the audit log (newest first). The log itself is written by post/react/thread.
export async function runAudit(opts, deps) {
  let limit = opts.limit != null ? parseInt(opts.limit, 10) : 20;
  if (Number.isNaN(limit) || limit < 1) limit = 20;
  return deps.readAudit({ limit });
}
