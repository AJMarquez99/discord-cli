const DISCORD_EPOCH_MS = 1420070400000n;

/**
 * Decode the creation time of a Discord snowflake ID into an ISO8601 string.
 * Returns null for null/undefined/empty input.
 */
export function snowflakeToIso(id) {
  if (id == null || id === '') return null;
  return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH_MS)).toISOString();
}
