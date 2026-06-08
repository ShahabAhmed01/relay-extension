const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Building Chrome MV3 extension package...');

const distDir = path.join(__dirname, 'dist');
const chromeDir = path.join(distDir, 'chrome');
const zipFile = path.join(distDir, 'relay-chrome.zip');

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}

fs.mkdirSync(chromeDir, { recursive: true });

const includePaths = [
  'manifest.json',
  'background.js',
  'browser-polyfill.js',
  'assets',
  'content',
  'options',
  'popup',
  'utils'
];

includePaths.forEach(p => {
  const src = path.join(__dirname, p);
  const dest = path.join(chromeDir, p);
  if (fs.existsSync(src)) {
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  }
});

console.log('Copied files to dist/chrome');

try {
  execSync(`powershell -Command "Compress-Archive -Path '${chromeDir}\\*' -DestinationPath '${zipFile}' -Force"`);
  console.log(`Successfully created ${zipFile}`);
} catch (e) {
  console.error('Failed to create ZIP archive:', e.message);
  process.exit(1);
}
