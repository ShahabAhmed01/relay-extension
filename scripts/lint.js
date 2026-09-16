#!/usr/bin/env node
/**
 * Relay — lightweight linter & integrity audit (no dependencies).
 * 1. Syntax-checks every JS file (node --check)
 * 2. Validates manifest.json structure and referenced files
 * 3. Privacy audit: flags network calls / remote code (Relay must be 100% local)
 * 4. Template-constant audit: every ${NAME} must be declared in the same file
 *    (this exact class of bug — undefined GEAR_SVG — broke the panel in v1.1.0)
 * 5. Parity: every registry platform host must be covered by manifest permissions
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const problems = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const jsFiles = walk(ROOT);

// 1. Syntax check every JS file
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`Syntax error in ${path.relative(ROOT, f)}: ${String(e.stderr || e.message).trim()}`);
  }
}

// 2. Manifest checks
const manifestPath = path.join(ROOT, 'manifest.json');
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
  problems.push(`manifest.json is not valid JSON: ${e.message}`);
}
if (manifest) {
  for (const key of ['manifest_version', 'name', 'version', 'content_scripts', 'permissions', 'host_permissions']) {
    if (!(key in manifest)) problems.push(`manifest.json missing "${key}"`);
  }
  if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
  for (const cs of manifest.content_scripts || []) {
    for (const js of cs.js || []) {
      if (!fs.existsSync(path.join(ROOT, js))) problems.push(`content_scripts references missing file: ${js}`);
    }
    for (const match of cs.matches || []) {
      if (!/^https:\/\/\*/.test(match) && !/^https:\/\//.test(match)) {
        problems.push(`suspicious content_scripts match pattern: ${match}`);
      }
    }
  }
  if (manifest.action && manifest.action.default_popup &&
      !fs.existsSync(path.join(ROOT, manifest.action.default_popup))) {
    problems.push('default_popup file missing');
  }
}

// 3. Privacy audit — Relay must never talk to the network
const NET_PATTERNS = [
  [/\bfetch\s*\(/, 'fetch() call'],
  [/new\s+XMLHttpRequest/, 'XMLHttpRequest'],
  [/new\s+WebSocket/, 'WebSocket'],
  [/\.src\s*=\s*['"`]https?:/, 'remote script/img src assignment'],
];
for (const f of jsFiles) {
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('tests') || rel.startsWith('scripts')) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const [re, label] of NET_PATTERNS) {
    if (re.test(src)) problems.push(`Privacy audit: ${label} found in ${rel} (Relay must be 100% local)`);
  }
}

// 4. Template-constant audit — every ${NAME} must be declared in the same file
for (const f of jsFiles) {
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('tests') || rel.startsWith('scripts')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const used = new Set();
  for (const m of src.matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)) used.add(m[1]);
  for (const name of used) {
    const declared =
      new RegExp(`\\b(?:var|let|const|function)\\s+${name}\\b`).test(src) ||
      new RegExp(`\\bfunction\\s+\\w+\\s*\\([^)]*\\b${name}\\b`).test(src); // function params
    if (!declared) {
      problems.push(`${rel}: \${${name}} used in a template literal but never declared in that file`);
    }
  }
}

// 5. Parity — registry hosts must be covered by manifest host_permissions
if (manifest) {
  try {
    const registry = require(path.join(ROOT, 'content', 'platforms', 'index.js'));
    const manifestHosts = new Set(
      (manifest.host_permissions || []).map((h) => h.replace(/^https?:\/\//, '').split('/')[0])
    );
    for (const p of registry.PLATFORMS) {
      for (const match of p.matches) {
        const covered = [...manifestHosts].some((h) => match === h || match.endsWith('.' + h));
        if (!covered) {
          problems.push(`Registry platform "${p.id}" match "${match}" is not covered by manifest host_permissions`);
        }
      }
      if (!/^https:\/\//.test(p.url)) problems.push(`Registry platform "${p.id}" has a non-HTTPS url`);
    }
  } catch (e) {
    problems.push(`Could not load platform registry: ${e.message}`);
  }
}

if (problems.length) {
  console.error(`✖ Relay lint found ${problems.length} problem(s):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`✔ Relay lint passed — ${jsFiles.length} JS files checked; manifest, privacy, template & parity audits clean.`);
