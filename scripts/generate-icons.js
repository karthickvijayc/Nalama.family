import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputFile = process.argv[2];
const prefix = process.argv[3] || 'pwa';

if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('Please provide a valid input image path.');
  console.error('Usage: node scripts/generate-icons.js <path-to-image> [prefix]');
  process.exit(1);
}

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

async function generateIcons() {
  try {
    console.log(`Generating icons from ${inputFile}...`);

    // 192x192
    await sharp(inputFile)
      .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(publicDir, `${prefix}-192x192.png`));
    console.log(`Created ${prefix}-192x192.png`);

    // 512x512
    await sharp(inputFile)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(publicDir, `${prefix}-512x512.png`));
    console.log(`Created ${prefix}-512x512.png`);

    // Maskable 512x512 (Add padding for safe zone, usually 20% padding)
    await sharp(inputFile)
      .resize(410, 410, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .extend({
        top: 51, bottom: 51, left: 51, right: 51,
        background: { r: 255, g: 255, b: 255, alpha: 1 } // White background for maskable
      })
      .toFile(path.join(publicDir, `${prefix}-maskable-512x512.png`));
    console.log(`Created ${prefix}-maskable-512x512.png`);

    // iOS Touch Icon (180x180)
    // iOS icons shouldn't have transparency, so we add a white background
    await sharp(inputFile)
      .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .flatten({ background: '#ffffff' })
      .toFile(path.join(publicDir, 'apple-touch-icon.png'));
    console.log(`Created apple-touch-icon.png`);
    
    // Default fallback icon
    await sharp(inputFile)
      .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(publicDir, 'icon.png'));
    console.log(`Created icon.png`);

    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

generateIcons();
