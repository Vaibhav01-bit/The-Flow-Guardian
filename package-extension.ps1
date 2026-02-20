# package-extension.ps1 — Flow Guardian Production Packaging Script
# This script creates a clean zip file for Microsoft Partner Center upload.

$ZipFileName = "flow-guardian-v2.1.zip"
$DistDir = "dist_package"

# 1. Cleanup old build
if (Test-Path $ZipFileName) { Remove-Item $ZipFileName -Force }
if (Test-Path $DistDir) { Remove-Item $DistDir -Recurse -Force }

# 2. Create clean dist directory
New-Item -ItemType Directory -Path $DistDir -Force | Out-Null

# 3. Define files and folders to include
$IncludeItems = @(
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "wellness.html",
    "wellness.js",
    "wellness.css",
    "reset.html",
    "reset.js",
    "style.css",
    "modules",
    "icons",
    "privacy.md",
    "LICENSE"
)

# 4. Copy items to dist
Write-Host "📦 Copying files to $DistDir..." -ForegroundColor Cyan
foreach ($item in $IncludeItems) {
    if (Test-Path $item) {
        $dest = Join-Path $DistDir $item
        if (Test-Path $item -PathType Container) {
            # Folder copy logic
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
            Copy-Item -Path "$item\*" -Destination $dest -Recurse -Force
            # Cleanup unwanted files in folders
            Get-ChildItem -Path $dest -Include "*.svg", "*.js.map", "convert-icons.js", "preview-options.js", "*.png.tmp" -Recurse | Remove-Item -Force
        } else {
            Copy-Item -Path $item -Destination $dest -Force
        }
    }
}

# 5. Remove any remaining unwanted files in dist root
Write-Host "🧹 Final cleanup..." -ForegroundColor Yellow
$Unwanted = @("*.svg", "package.json", "package-lock.json", "optimize_icons.py")
foreach ($pattern in $Unwanted) {
    if (Test-Path "$DistDir\$pattern") { Remove-Item "$DistDir\$pattern" -Force }
}

# 6. Create Zip
Write-Host "🤐 Zipping into $ZipFileName..." -ForegroundColor Green
Compress-Archive -Path "$DistDir\*" -DestinationPath $ZipFileName -Force

# 7. Verification
$info = Get-Item $ZipFileName
$sizeMB = [math]::Round($info.Length / 1MB, 2)
Write-Host "✅ Done! Package created: $ZipFileName ($sizeMB MB)" -ForegroundColor White
Write-Host "🚀 You can now upload this file to Microsoft Partner Center." -ForegroundColor Green

# Cleanup dist folder
Remove-Item $DistDir -Recurse -Force
