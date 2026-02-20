// convert-icons.js — renders icon_master.svg to PNG at multiple sizes
// Uses: npm install sharp (or falls back to canvas)
// Run: node convert-icons.js

const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'icon_master.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');
const sizes = [16, 32, 48, 128];

async function convertWithSharp() {
    const sharp = require('sharp');
    for (const size of sizes) {
        const outPath = path.join(__dirname, `icon${size}.png`);
        await sharp(Buffer.from(svgContent))
            .resize(size, size)
            .png()
            .toFile(outPath);
        console.log(`✓ Written ${outPath}`);
    }
    console.log('All icons generated!');
}

convertWithSharp().catch(async (err) => {
    console.error('sharp failed:', err.message);
    console.log('Trying canvas fallback...');
    try {
        const { createCanvas, loadImage } = require('canvas');
        const { JSDOM } = require('jsdom');
        console.error('canvas approach also unavailable, try: npm install sharp');
    } catch (e) {
        console.error('No fallback available. Please run: npm install sharp');
        console.error('Then re-run this script.');
    }
});
