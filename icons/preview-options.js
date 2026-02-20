// preview-options.js — converts all option SVGs to 128px preview PNGs
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const options = [
    { svg: 'option_a_shield.svg', out: 'preview_a_shield.png' },
    { svg: 'option_b_infinity.svg', out: 'preview_b_infinity.png' },
    { svg: 'option_c_zen.svg', out: 'preview_c_zen.png' },
    { svg: 'option_d_crystal.svg', out: 'preview_d_crystal.png' },
];

(async () => {
    for (const { svg, out } of options) {
        const svgContent = fs.readFileSync(path.join(__dirname, svg));
        await sharp(svgContent).resize(128, 128).png().toFile(path.join(__dirname, out));
        console.log(`✓ ${out}`);
    }
})();
