#!/usr/bin/env node
/**
 * Assemble the deployable site in _site/ (what GitHub Pages publishes).
 *
 * - Copies only application files (no tests, docs, tooling or node_modules).
 * - Stamps the service worker BUILD_ID and version.json with the commit and time,
 *   so every deployment produces a new worker and a safe cache switch.
 * - Fails if any service-worker precache entry is missing from the output.
 */
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
const ENTRIES = ['index.html', 'manifest.json', 'service-worker.js', 'version.json', 'css', 'js', 'assets'];
const OPTIONAL = ['data'];

function commitId() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return `local-${Date.now().toString(36)}`;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function buildSite() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const entry of [...ENTRIES, ...OPTIONAL]) {
    const source = join(root, entry);
    if (!(await exists(source))) {
      if (ENTRIES.includes(entry)) throw new Error(`Missing required entry: ${entry}`);
      continue;
    }
    await cp(source, join(out, entry), { recursive: true });
  }
  await writeFile(join(out, '.nojekyll'), '');

  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const commit = commitId();
  const builtAt = new Date().toISOString();

  const swPath = join(out, 'service-worker.js');
  const sw = await readFile(swPath, 'utf8');
  if (!sw.includes("const BUILD_ID = 'dev';")) throw new Error('service-worker.js has no BUILD_ID placeholder');
  await writeFile(swPath, sw.replace("const BUILD_ID = 'dev';", `const BUILD_ID = '${commit}';`));

  const version = JSON.parse(await readFile(join(out, 'version.json'), 'utf8'));
  await writeFile(join(out, 'version.json'), `${JSON.stringify({ ...version, version: pkg.version, commit, builtAt }, null, 2)}\n`);

  const match = sw.match(/PRECACHE-START[\s\S]*?\[([\s\S]*?)\];[\s\S]*?PRECACHE-END/);
  const urls = [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const missing = [];
  for (const url of urls) {
    const path = url === './' ? 'index.html' : url.replace(/^\.\//, '');
    if (!(await exists(join(out, path)))) missing.push(url);
  }
  if (missing.length) throw new Error(`Precache entries missing from _site: ${missing.join(', ')}`);
  return { out, commit, builtAt, files: urls.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildSite()
    .then(({ out: dir, commit, files }) => process.stdout.write(`Built ${dir} (commit ${commit}, ${files} precached files)\n`))
    .catch((error) => {
      process.stderr.write(`Build failed: ${error.message}\n`);
      process.exit(1);
    });
}
