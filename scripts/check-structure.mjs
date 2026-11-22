#!/usr/bin/env node
/**
 * Structural quality gate, run before tests and before every deployment.
 *
 * Checks: required files, JSON validity, JavaScript syntax, that every relative
 * import resolves, that index.html references exist and are relative (GitHub
 * Pages sub-path), that the service-worker precache list matches the files on
 * disk, manifest completeness, version consistency, and the security/CSP rules
 * (no innerHTML-style sinks, no inline styles or scripts, console use only in the logger).
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_FILES = [
  'index.html',
  'manifest.json',
  'service-worker.js',
  'version.json',
  'README.md',
  'PROJECT_STATE.md',
  'CHANGELOG.md',
  'package.json',
  '.github/workflows/ci-deploy.yml',
  'docs/architecture.md',
  'docs/roadmap.md',
  'docs/engineering-models.md',
  'docs/ai-models.md',
  'docs/deployment.md',
  'docs/data-model.md',
  'js/app.js',
  'js/router.js',
  'js/database.js',
  'js/project-manager.js',
  'js/state-manager.js',
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const result = [];
  if (!(await exists(dir))) return result;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(full)));
    else result.push(full);
  }
  return result;
}

const rel = (path) => relative(ROOT, path).split(sep).join('/');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

export async function runChecks(root = ROOT) {
  const errors = [];
  const passed = [];
  const check = (name, problems) => {
    if (problems.length) errors.push(...problems.map((p) => `${name}: ${p}`));
    else passed.push(name);
  };

  // 1. Required files
  const missing = [];
  for (const file of REQUIRED_FILES) if (!(await exists(join(root, file)))) missing.push(file);
  check('required files', missing.map((f) => `missing ${f}`));

  // 2. JSON validity
  const jsonFiles = ['package.json', 'manifest.json', 'version.json', ...(await walk(join(root, 'data'))).filter((f) => f.endsWith('.json')).map(rel)];
  const json = {};
  const jsonProblems = [];
  for (const file of jsonFiles) {
    try {
      json[file] = JSON.parse(await readFile(join(root, file), 'utf8'));
    } catch (error) {
      jsonProblems.push(`${file} is not valid JSON (${error.message})`);
    }
  }
  check('JSON validity', jsonProblems);

  // 3. JavaScript syntax and 4. import resolution
  const jsFiles = (await walk(join(root, 'js'))).filter((f) => f.endsWith('.js'));
  const syntax = [];
  const imports = [];
  const sinks = [];
  const consoleUse = [];
  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
      syntax.push(`${rel(file)}: ${String(error.stderr).split('\n').find((line) => line.includes('Error')) ?? 'syntax error'}`);
    }
    const source = await readFile(file, 'utf8');
    const code = stripComments(source);
    for (const match of code.matchAll(/(?:import|export)\s[^'"`]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|^\s*import\s+['"](\.[^'"]+)['"]/gm)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      const target = resolve(dirname(file), specifier);
      if (!(await exists(target))) imports.push(`${rel(file)} imports missing ${specifier}`);
    }
    if (/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|\beval\s*\(|new\s+Function\s*\(/.test(code)) {
      sinks.push(`${rel(file)} uses an HTML/code injection sink (innerHTML, insertAdjacentHTML, document.write, eval)`);
    }
    if (rel(file) !== 'js/utils/logger.js' && /\bconsole\.(log|info|warn|error|debug)\s*\(/.test(code)) {
      consoleUse.push(`${rel(file)} calls console.* directly (use the logger)`);
    }
  }
  check('JavaScript syntax', syntax);
  check('import resolution', imports);
  check('no HTML injection sinks', sinks);
  check('console only via logger', consoleUse);

  // 5. index.html references, CSP-compatible markup
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const htmlProblems = [];
  for (const match of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    const ref = match[1];
    if (/^(https?:|mailto:|#|data:)/.test(ref)) continue;
    if (ref.startsWith('/')) htmlProblems.push(`absolute path ${ref} breaks on the GitHub Pages sub-path`);
    else if (!(await exists(join(root, ref.split('#')[0].split('?')[0])))) htmlProblems.push(`missing referenced file ${ref}`);
  }
  if (/\sstyle\s*=/.test(html)) htmlProblems.push('inline style attribute (blocked by the Content-Security-Policy)');
  if (/<style[\s>]/.test(html)) htmlProblems.push('inline <style> block (blocked by the Content-Security-Policy)');
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/\ssrc=/.test(match[1]) || match[2].trim()) htmlProblems.push('inline <script> code (blocked by the Content-Security-Policy)');
  }
  if (!/Content-Security-Policy/.test(html)) htmlProblems.push('missing Content-Security-Policy meta tag');
  check('index.html references and CSP', htmlProblems);

  // 6. Service-worker precache list matches the files on disk
  const sw = await readFile(join(root, 'service-worker.js'), 'utf8');
  const block = sw.match(/PRECACHE-START[\s\S]*?\[([\s\S]*?)\];[\s\S]*?PRECACHE-END/);
  const precache = new Set([...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
  const swProblems = [];
  if (!block) swProblems.push('PRECACHE-START/END block not found');
  if (!sw.includes("const BUILD_ID = 'dev';")) swProblems.push("BUILD_ID placeholder 'dev' missing (the build stamps it)");
  for (const url of precache) {
    if (!url.startsWith('./')) swProblems.push(`precache entry ${url} must be relative (./…)`);
    const path = url === './' ? 'index.html' : url.slice(2);
    if (!(await exists(join(root, path)))) swProblems.push(`precache entry ${url} does not exist`);
  }
  const appFiles = [
    'index.html',
    'manifest.json',
    'version.json',
    ...(await walk(join(root, 'js'))).map(rel),
    ...(await walk(join(root, 'css'))).map(rel),
    ...(await walk(join(root, 'assets', 'icons'))).map(rel),
  ];
  for (const file of appFiles) if (!precache.has(`./${file}`)) swProblems.push(`${file} is not in the precache list (offline mode would break)`);
  check('service-worker precache', swProblems);

  // 7. Manifest
  const manifest = json['manifest.json'] ?? {};
  const manifestProblems = [];
  for (const key of ['name', 'short_name', 'start_url', 'scope', 'display', 'icons']) if (!manifest[key]) manifestProblems.push(`missing ${key}`);
  const icons = manifest.icons ?? [];
  if (!icons.some((i) => i.sizes === '192x192')) manifestProblems.push('no 192×192 icon');
  if (!icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')) manifestProblems.push('no 512×512 icon');
  if (!icons.some((i) => i.purpose === 'maskable')) manifestProblems.push('no maskable icon');
  for (const i of icons) if (!(await exists(join(root, i.src)))) manifestProblems.push(`icon file ${i.src} missing`);
  if (String(manifest.start_url).startsWith('/') || String(manifest.scope).startsWith('/')) manifestProblems.push('start_url/scope must be relative for a project site');
  check('web app manifest', manifestProblems);

  // 8. Version consistency
  const versionProblems = [];
  const pkgVersion = json['package.json']?.version;
  const versionJs = await readFile(join(root, 'js', 'version.js'), 'utf8');
  const appVersion = versionJs.match(/APP_VERSION\s*=\s*'([^']+)'/)?.[1];
  const swVersion = sw.match(/const VERSION\s*=\s*'([^']+)'/)?.[1];
  const fileVersion = json['version.json']?.version;
  for (const [label, value] of [
    ['js/version.js APP_VERSION', appVersion],
    ['service-worker.js VERSION', swVersion],
    ['version.json version', fileVersion],
  ]) {
    if (value !== pkgVersion) versionProblems.push(`${label} is ${value}, package.json is ${pkgVersion}`);
  }
  const changelog = (await exists(join(root, 'CHANGELOG.md'))) ? await readFile(join(root, 'CHANGELOG.md'), 'utf8') : '';
  if (!changelog.includes(`## [${pkgVersion}]`)) versionProblems.push(`CHANGELOG.md has no "## [${pkgVersion}]" entry`);
  check('version consistency', versionProblems);

  // 9. Every available module has a view
  const registryProblems = [];
  const { MODULES } = await import(pathToFileURL(join(root, 'js', 'modules', 'module-registry.js')).href);
  const appSource = await readFile(join(root, 'js', 'app.js'), 'utf8');
  const viewsBlock = appSource.match(/const VIEWS = \{([^}]*)\}/)?.[1] ?? '';
  for (const module of MODULES) {
    if (module.status !== 'planned' && !new RegExp(`(^|[\\s,{'"])${module.id.replace(/[-]/g, '\\-')}['"]?\\s*:`).test(viewsBlock)) registryProblems.push(`module "${module.id}" is ${module.status} but has no view in app.js`);
    if (module.status === 'planned' && !module.scope?.length) registryProblems.push(`planned module "${module.id}" has no scope description`);
  }
  check('module registry', registryProblems);

  // 10. Deployment workflow
  const workflowPath = join(root, '.github', 'workflows', 'ci-deploy.yml');
  const workflow = (await exists(workflowPath)) ? await readFile(workflowPath, 'utf8') : '';
  const workflowProblems = [];
  for (const needle of ['actions/upload-pages-artifact', 'actions/deploy-pages', 'npm run check', 'npm run test:unit', 'npm run test:e2e', 'npm run build']) {
    if (!workflow.includes(needle)) workflowProblems.push(`workflow does not run/use ${needle}`);
  }
  check('CI/CD workflow', workflowProblems);

  return { errors, passed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { errors, passed } = await runChecks();
  for (const name of passed) process.stdout.write(`  ✔ ${name}\n`);
  for (const error of errors) process.stdout.write(`  ✖ ${error}\n`);
  process.stdout.write(`\n${passed.length} check groups passed, ${errors.length} problem(s)\n`);
  process.exit(errors.length ? 1 : 0);
}
