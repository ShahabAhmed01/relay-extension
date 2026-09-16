#!/usr/bin/env node
/**
 * Relay — cross-platform build & packaging (no OS-specific requirements).
 *
 * Targets:
 *   --target=chrome   (default) store-ready MV3 package → dist/chrome + zip
 *   --target=firefox  Gecko-compatible manifest → dist/firefox + zip
 *   --target=source   clean source archive → dist/source + zip
 *
 * Every target is validated (required files present) and gets a sha256 checksum.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const ROOT = __dirname;
const arg = process.argv.find((a) => a.startsWith('--target='));
const target = (arg ? arg.split('=')[1] : 'chrome').toLowerCase();

if (!['chrome', 'firefox', 'source'].includes(target)) {
  console.error(`Unknown target "${target}" — use chrome | firefox | source`);
  process.exit(1);
}

const INCLUDE = [
  'manifest.json', 'background.js', 'browser-polyfill.js',
  'assets', 'content', 'options', 'popup', 'utils',
];

function copyInto(src, dest) {
  const to = path.join(dest, path.basename(src));
  if (fs.statSync(src).isDirectory()) fs.cpSync(src, to, { recursive: true });
  else fs.copyFileSync(src, to);
}

function buildChrome(dir) {
  for (const p of INCLUDE) {
    const src = path.join(ROOT, p);
    if (fs.existsSync(src)) copyInto(src, dir);
    else console.warn(`  ! optional file missing: ${p}`);
  }
}

function buildFirefox(dir) {
  buildChrome(dir);
  const mPath = path.join(dir, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  // Gecko MV3 uses an event page with background scripts.
  m.background = { scripts: ['background.js'] };
  m.browser_specific_settings = {
    gecko: {
      id: 'relay-ai-context-bridge@shahabahmed.dev',
      strict_min_version: '115.0',
    },
  };
  delete m.minimum_chrome_version;
  fs.writeFileSync(mPath, JSON.stringify(m, null, 2) + '\n');
}

function buildSource(dir) {
  const skip = new Set(['dist', 'node_modules', '.git']);
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    copyInto(path.join(ROOT, entry.name), dir);
  }
}

function validate(dir) {
  const required = ['manifest.json', 'background.js', 'browser-polyfill.js'];
  for (const f of required) {
    if (!fs.existsSync(path.join(dir, f))) throw new Error(`Build missing required file: ${f}`);
  }
  JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')); // throws if invalid
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  for (const cs of m.content_scripts || []) {
    for (const js of cs.js || []) {
      if (!fs.existsSync(path.join(dir, js))) throw new Error(`Bundled content script missing: ${js}`);
    }
  }
}

function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crc32.table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

// Minimal deterministic STORE-method zip writer (stdlib only, no compression).
// Chrome Web Store and AMO both accept store-only archives.
function zipStore(srcDir, outZip) {
  const files = [];
  (function walk(dir, rel) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const r = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(abs, r);
      else files.push({ name: r, abs });
    }
  })(srcDir, '');

  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4);         // version needed
    local.writeUInt16LE(0x0800, 6);     // UTF-8 names
    local.writeUInt16LE(0, 8);          // method: store
    local.writeUInt16LE(0, 10);         // time (deterministic)
    local.writeUInt16LE(0x21, 12);      // date (deterministic)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory header
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([cd, nameBuf]));

    offset += 30 + nameBuf.length + data.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  fs.writeFileSync(outZip, Buffer.concat([...chunks, cdBuf, eocd]));
}

function zipDir(srcDir, outZip) {
  try {
    execFileSync('zip', ['-r', '-q', outZip, '.'], { cwd: srcDir, stdio: 'pipe' });
    return 'zip';
  } catch (_e) {
    try {
      execFileSync('powershell.exe', [
        '-NoProfile', '-Command',
        `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${outZip}' -Force`,
      ], { stdio: 'pipe' });
      return 'powershell';
    } catch (_e2) {
      zipStore(srcDir, outZip);
      return 'built-in (store)';
    }
  }
}

console.log(`Building Relay package (target: ${target})...`);
const distDir = path.join(ROOT, 'dist');
fs.mkdirSync(distDir, { recursive: true });

const targetDir = path.join(distDir, target);
if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
const zipFile = path.join(distDir, `relay-${target}.zip`);
for (const old of [zipFile, zipFile + '.sha256']) {
  if (fs.existsSync(old)) fs.rmSync(old, { force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

if (target === 'chrome') buildChrome(targetDir);
else if (target === 'firefox') buildFirefox(targetDir);
else buildSource(targetDir);

validate(targetDir);
console.log(`Copied + validated dist/${target}`);

const tool = zipDir(targetDir, zipFile);
console.log(`Created ${zipFile} (via ${tool})`);

const hash = crypto.createHash('sha256').update(fs.readFileSync(zipFile)).digest('hex');
fs.writeFileSync(zipFile + '.sha256', hash + '  ' + path.basename(zipFile) + '\n');
console.log(`sha256: ${hash}`);

const size = (fs.statSync(zipFile).size / 1024).toFixed(1);
console.log(`✔ Done — dist/${target} (${size} KB zipped).`);

