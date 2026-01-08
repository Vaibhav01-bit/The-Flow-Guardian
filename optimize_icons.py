"""
Optimize existing Flow Guardian icon for Chrome/Edge extension.
- Crops excess padding
- Creates size-specific versions (16x16, 32x32, 48x48, 128x128)
- Increases visual weight for readability at small sizes
- Keeps original design intact
"""

from PIL import Image
import os

def find_content_bounds(img):
    """Find the bounding box of non-transparent content."""
    bbox = img.getbbox()
    if bbox is None:
        return (0, 0, img.width, img.height)
    return bbox

def crop_and_resize_icon(source_path, size, target_filename):
    """
    Load icon, crop padding, resize to target size, and enhance at small sizes.
    """
    # Load original icon
    img = Image.open(source_path).convert('RGBA')
    
    # Find and crop to content
    bbox = find_content_bounds(img)
    cropped = img.crop(bbox)
    
    # Resize to target size
    resized = cropped.resize((size, size), Image.Resampling.LANCZOS)
    
    # For small sizes (16x32), enhance contrast slightly for better readability
    if size <= 32:
        # Increase visual weight by slightly darkening and boosting contrast
        pixels = resized.load()
        width, height = resized.size
        
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                
                # Only adjust non-transparent pixels
                if a > 0:
                    # Increase alpha channel for semi-transparent pixels
                    if a < 255 and a > 100:
                        a = min(255, int(a * 1.15))
                    
                    # Slightly darken the icon for better visibility
                    if (r, g, b) != (255, 255, 255):
                        r = max(0, int(r * 0.95))
                        g = max(0, int(g * 0.95))
                        b = max(0, int(b * 0.95))
                    
                    pixels[x, y] = (r, g, b, a)
    
    # Add tight padding (1-2 pixels) to maintain proper spacing
    padding = 1 if size <= 32 else 2
    final = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    
    # Calculate offset to center the resized icon with small padding
    offset_x = (size - resized.width) // 2
    offset_y = (size - resized.height) // 2
    final.paste(resized, (offset_x, offset_y), resized)
    
    # Save
    workspace = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(workspace, target_filename)
    final.save(filepath, 'PNG')
    
    return filepath

def main():
    workspace = os.path.dirname(os.path.abspath(__file__))
    source_icon = os.path.join(workspace, 'icon.png')
    
    if not os.path.exists(source_icon):
        print("✗ icon.png not found!")
        return
    
    print("Optimizing Flow Guardian extension icon...")
    print("Source: icon.png")
    print("Crop: Removing excess transparent padding")
    print("Enhancement: Increasing visual weight at small sizes\n")
    
    # Create optimized versions
    configs = [
        (16, 'icon-16.png'),
        (32, 'icon-32.png'),
        (48, 'icon-48.png'),
        (128, 'icon-128.png'),
    ]
    
    for size, filename in configs:
        filepath = crop_and_resize_icon(source_icon, size, filename)
        print(f"✓ Created {filename} ({size}×{size})")
    
    print("\n✓ Icon optimization complete!")
    print("\nNext steps:")
    print("1. Update manifest.json to use individual icon files")
    print("2. Reload extension in Chrome/Edge")
    print("3. Verify only ONE icon appears on Extensions page")

if __name__ == '__main__':
    main()
