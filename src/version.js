import { createRequire } from 'node:module';

// Single source of truth for the version: read it from package.json so the CLI,
// the MCP server, and the REST User-Agent never drift from the published version.
const require = createRequire(import.meta.url);
export const VERSION = require('../package.json').version;
