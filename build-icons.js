/**
 * Relay — Icon Build Script
 * Generates PNG icons from the SVG logo at multiple sizes.
 * Usage: node build-icons.js
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, 'assets', 'relay-logo.svg');
const OUTPUT_DIR = path.join(__dirname, 'assets');
const SIZES = [16, 32, 48, 128];

async function buildIcons() {
  const svgBuffer = fs.readFileSync(SVG_PATH);

  for (const size of SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: ${outputPath}`);
  }

  console.log('All icons generated successfully.');
}

buildIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
