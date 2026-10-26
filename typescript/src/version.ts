/**
 * Sent in the User-Agent. A constant rather than read from package.json, which
 * not every runtime can load; scripts/release.mjs keeps the two in step and a
 * test fails if they drift.
 */
export const VERSION = '2.0.0'
