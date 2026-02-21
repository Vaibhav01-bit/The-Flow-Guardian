// build-final.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const zipName = 'FlowGuardian_Final.zip';
const staging = path.join(__dirname, 'staging_final');

// 1. Cleanup
if (fs.existsSync(zipName)) fs.unlinkSync(zipName);
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });

// 2. Create Staging
fs.mkdirSync(staging);

// 3. Define items
const filesToCopy = [
    'manifest.json', 'background.js', 'content.js',
    'popup.html', 'popup.js', 'wellness.html',
    'wellness.js', 'wellness.css', 'reset.html',
    'reset.js', 'style.css', 'privacy.md', 'LICENSE'
];

const dirsToCopy = ['icons', 'modules'];

console.log('📦 Copying files...');
filesToCopy.forEach(f => {
    if (fs.existsSync(f)) fs.copyFileSync(f, path.join(staging, f));
});

dirsToCopy.forEach(d => {
    if (fs.existsSync(d)) {
        const destDir = path.join(staging, d);
        fs.mkdirSync(destDir, { recursive: true });
        copyDirRecursive(d, destDir);
    }
});

function copyDirRecursive(src, dest) {
    fs.readdirSync(src).forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        if (file.endsWith('.svg') || file === 'convert-icons.js' || file === 'preview-options.js' || file.includes('preview_')) return;

        if (fs.lstatSync(srcPath).isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

console.log('🤐 Zipping contents of staging folder...');
try {
    // We use powershell just for the compression of staging folder contents
    const cmd = `powershell -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipName}' -Force"`;
    execSync(cmd);
    console.log(`✅ Successfully created ${zipName}`);
} catch (err) {
    console.error('Zipping failed:', err.message);
}

// 4. Final Cleanup
fs.rmSync(staging, { recursive: true, force: true });
