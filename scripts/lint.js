#!/usr/bin/env node
/**
 * Relay — lightweight linter & integrity audit (no dependencies).
 *
 * 1. Syntax-checks every JS file (node --check)
 * 2. Validates manifest.json structure, referenced files and permissions
 * 3. Privacy audit — Relay must be 100% local:
 *    - no XHR/WebSocket, no remote src, no eval, no remote imports
 *    - fetch() allowed ONLY in files carrying the
 *      "relay-audit: same-origin-fetch" annotation (used for opt-in,
 *      same-origin attachment capture) and never with a literal remote URL
 * 4. innerHTML audit — assignment RHS must be a known-safe static template
 *    (scraped content must never reach innerHTML)
 * 5. Template-constant audit — every ${NAME} must be declared in-file
 * 6. Parity — every registry platform host must be covered by manifest
 *    permissions, and every bundled content script must exist in the build
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
      if (!/^https:\/\//.test(match)) {
        problems.push(`suspicious content_scripts match pattern: ${match}`);
      }
    }
  }
  if (manifest.action && manifest.action.default_popup &&
      !fs.existsSync(path.join(ROOT, manifest.action.default_popup))) {
    problems.push('default_popup file missing');
  }
  if (manifest.options_ui && manifest.options_ui.page &&
      !fs.existsSync(path.join(ROOT, manifest.options_ui.page))) {
    problems.push('options_ui page missing');
  }
  // Permissions must stay minimal: anything beyond this allowlist needs a
  // justification in the PR + README.
  const ALLOWED_PERMISSIONS = ['storage', 'tabs'];
  for (const perm of manifest.permissions || []) {
    if (!ALLOWED_PERMISSIONS.includes(perm)) {
      problems.push(`manifest permission "${perm}" is not on the audited allowlist (${ALLOWED_PERMISSIONS.join(', ')}) — document why it is needed`);
    }
  }
  // Versions must match between manifest and package.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (pkg.version !== manifest.version) {
      problems.push(`version mismatch: package.json ${pkg.version} != manifest.json ${manifest.version}`);
    }
  } catch (_e) { /* package.json optional in source archives */ }
}

// 3. Privacy audit — Relay must never talk to the network (except the one
//    audited same-origin fetch for opt-in attachment capture).
const FETCH_ANNOTATION = 'relay-audit: same-origin-fetch';
const NET_PATTERNS = [
  [/\bnew\s+XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bnew\s+WebSocket/, 'WebSocket'],
  [/\.src\s*=\s*['"`]https?:/, 'remote src assignment'],
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/\bdocument\.write\s*\(/, 'document.write()'],
  [/\bimportScripts\s*\(\s*['"`]https?:/, 'remote importScripts'],
  [/\bimport\s+.*from\s+['"`]https?:/, 'remote import'],
];
for (const f of jsFiles) {
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('tests') || rel.startsWith('scripts')) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const [re, label] of NET_PATTERNS) {
    if (re.test(src)) problems.push(`Privacy audit: ${label} found in ${rel}`);
  }
  if (/\bfetch\s*\(/.test(src)) {
    if (!src.includes(FETCH_ANNOTATION)) {
      problems.push(`Privacy audit: fetch() found in ${rel} without the "${FETCH_ANNOTATION}" annotation`);
    } else if (/fetch\s*\(\s*['"`]https?:/.test(src)) {
      problems.push(`Privacy audit: fetch() with a literal remote URL in ${rel} — only same-origin variable URLs are allowed`);
    }
  }
}

// 4. innerHTML audit — scraped or page-controlled data must never be
//    assigned as HTML. Allowed RHS: string literals, our static template
//    functions html()/css(), and registry constants (logoSvg / LOGO_SVG / ICONS.*).
const SAFE_INNERHTML = /^(?:['"`](?:[^'"`\\]|\\.)*['"`]|html\(\)|css\(\)|[A-Za-z_$][\w$]*\.logoSvg|LOGO_SVG|ICONS\.[A-Za-z_$][\w$]*)\s*;?\s*$/;
for (const f of jsFiles) {
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('tests') || rel.startsWith('scripts')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const re = /\.innerHTML\s*=\s*([^;\n]+);?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const rhs = m[1];
    if (!SAFE_INNERHTML.test(rhs.trim())) {
      problems.push(`innerHTML audit: non-static assignment in ${rel}: .innerHTML = ${rhs.slice(0, 60)}`);
    }
  }
}

// 5. Template-constant audit — every ${NAME} must be declared in the same file
for (const f of jsFiles) {
  const rel = path.relative(ROOT, f);
  if (rel.startsWith('tests') || rel.startsWith('scripts')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const used = new Set();
  for (const m of src.matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)) used.add(m[1]);
  for (const name of used) {
    const declared =
      new RegExp(`\\b(?:var|let|const)\\s+${name}\\b`).test(src) ||
      new RegExp(`\\bfunction\\s+\\w+\\s*\\([^)]*\\b${name}\\b`).test(src);
    if (!declared) {
      problems.push(`${rel}: \${${name}} used in a template literal but never declared in that file`);
    }
  }
}

// 6. Parity — registry hosts must be covered by manifest host_permissions
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
console.log(`✔ Relay lint passed — ${jsFiles.length} JS files checked; manifest, privacy, innerHTML, template & parity audits clean.`);
