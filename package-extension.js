// package-extension.js — Flow Guardian Production Packaging Script
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver'); // I'll need to install this or use a different zipping method

const zipFileName = 'flow-guardian-v2.1.zip';
const distDir = path.join(__dirname, 'dist_package');

// 1. Cleanup
if (fs.existsSync(zipFileName)) fs.unlinkSync(zipFileName);
if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });

// 2. Create dist
fs.mkdirSync(distDir);

// 3. Define items
const includeItems = [
    'manifest.json',
    'background.js',
    'content.js',
    'popup.html',
    'popup.js',
    'wellness.html',
    'wellness.js',
    'wellness.css',
    'reset.html',
    'reset.js',
    'style.css',
    'modules',
    'icons',
    'privacy.md',
    'LICENSE'
];

console.log('📦 Copying files...');

includeItems.forEach(item => {
    const src = path.join(__dirname, item);
    const dest = path.join(distDir, item);

    if (!fs.existsSync(src)) return;

    if (fs.lstatSync(src).isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        copyRecursive(src, dest);
    } else {
        fs.copyFileSync(src, dest);
    }
});

function copyRecursive(src, dest) {
    fs.readdirSync(src).forEach(file => {
        const srcFile = path.join(src, file);
        const destFile = path.join(dest, file);

        // Ignore unwanted files
        if (file.endsWith('.svg') || file === 'convert-icons.js' || file === 'preview-options.js' || file.includes('preview_')) {
            return;
        }

        if (fs.lstatSync(srcFile).isDirectory()) {
            fs.mkdirSync(destFile, { recursive: true });
            copyRecursive(srcFile, destFile);
        } else {
            fs.copyFileSync(srcFile, destFile);
        }
    });
}

console.log('🤐 Zipping...');

// Since I might not have 'archiver' installed, I'll use PowerShell's Compress-Archive via execSync
// or just a simple zip command if available. But since this is Windows, PowerShell is safest for zipping.
try {
    const zipCmd = `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipFileName}' -Force"`;
    execSync(zipCmd);
    console.log(`✅ Done! Created ${zipFileName}`);
} catch (err) {
    console.error('Zipping failed:', err.message);
}

// Cleanup
fs.rmSync(distDir, { recursive: true, force: true });
