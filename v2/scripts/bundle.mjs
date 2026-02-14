#!/usr/bin/env node
/**
 * v2/scripts/bundle.mjs
 *
 * esbuild bundler for CLI (we.js) and MCP (codeb-mcp.js).
 * Produces self-contained single-file bundles with:
 * - All workspace:* packages inlined
 * - All npm deps inlined (commander, chalk, ora, @modelcontextprotocol/sdk, etc.)
 * - Node builtins kept external (platform: node)
 * - VERSION injected via banner (process.env.CODEB_VERSION)
 * - #!/usr/bin/env node shebang prepended (post-process)
 *
 * Prerequisites: `turbo build` must run first (compiles .ts to dist/).
 *
 * Usage:
 *   node scripts/bundle.mjs          # Build both CLI + MCP
 *   node scripts/bundle.mjs --cli    # Build CLI only
 *   node scripts/bundle.mjs --mcp    # Build MCP only
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPO_ROOT = join(ROOT, '..');

// Read VERSION (SSOT)
const VERSION = readFileSync(join(REPO_ROOT, 'VERSION'), 'utf-8').trim();
console.log(`Bundling CodeB v${VERSION}\n`);

// Ensure output directory
mkdirSync(join(ROOT, 'dist', 'bundle'), { recursive: true });

// Common esbuild options
const commonOptions = {
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  bundle: true,
  minify: false,
  sourcemap: false,
  treeShaking: true,
  // Server-only packages: mark external as safety net
  external: [
    'ssh2', 'ssh2-sftp-client', 'cpu-features',
    'pg', 'pg-native', 'pg-pool',
    'winston', 'winston-daily-rotate-file',
    'prom-client',
    'express', 'cors', 'helmet',
    'blessed', 'blessed-contrib',
  ],
  // Version injection (no shebang here — added post-build)
  banner: {
    js: `process.env.CODEB_VERSION = ${JSON.stringify(VERSION)};`,
  },
};

/**
 * Post-process a bundle:
 * 1. Remove any existing shebangs from source (#!/usr/bin/env tsx etc.)
 * 2. Prepend #!/usr/bin/env node
 */
function postProcess(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  // Remove all shebang lines (could be from original source)
  content = content.replace(/^#!\/usr\/bin\/env [^\n]*\n/gm, '');
  // Prepend proper shebang
  content = '#!/usr/bin/env node\n' + content;
  writeFileSync(filePath, content);
}

const args = process.argv.slice(2);
const buildCli = args.length === 0 || args.includes('--cli');
const buildMcp = args.length === 0 || args.includes('--mcp');

const builds = [];

if (buildCli) {
  const outfile = join(ROOT, 'dist/bundle/we.js');
  builds.push(
    build({
      ...commonOptions,
      entryPoints: [join(ROOT, 'apps/cli/dist/bin/we.js')],
      outfile,
    }).then(() => {
      postProcess(outfile);
      const size = readFileSync(outfile).length;
      console.log(`  CLI  -> dist/bundle/we.js (${(size / 1024).toFixed(0)} KB)`);
    }),
  );
}

if (buildMcp) {
  const outfile = join(ROOT, 'dist/bundle/codeb-mcp.js');
  builds.push(
    build({
      ...commonOptions,
      entryPoints: [join(ROOT, 'apps/mcp/dist/bin/codeb-mcp.js')],
      outfile,
    }).then(() => {
      postProcess(outfile);
      const size = readFileSync(outfile).length;
      console.log(`  MCP  -> dist/bundle/codeb-mcp.js (${(size / 1024).toFixed(0)} KB)`);
    }),
  );
}

try {
  await Promise.all(builds);
  console.log(`\nDone. ${builds.length} bundle(s) built.`);
} catch (err) {
  console.error('\nBundle failed:', err.message);
  process.exit(1);
}
