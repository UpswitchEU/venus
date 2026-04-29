/**
 * Icon Generation Script
 * 
 * Generates PNG icons from SVG favicon for various platforms.
 * Requires: puppeteer or sharp (install with: npm install puppeteer)
 * 
 * Usage: node public/generate-icons.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = __dirname;

// Check if puppeteer is available
let puppeteer;
try {
  puppeteer = await import('puppeteer');
} catch (e) {
  console.log('Puppeteer not found. Install with: npm install puppeteer');
  console.log('For now, SVG icons have been created. Convert them to PNG manually or install puppeteer.');
  process.exit(0);
}

const faviconSvg = path.join(publicDir, 'logos/upswitch-app-icon.svg');
const svgContent = fs.readFileSync(faviconSvg, 'utf-8');

// Icon sizes needed
const icons = [
  { name: 'favicon.ico', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

async function generateIcons() {
  const browser = await puppeteer.default.launch();
  const page = await browser.newPage();

  for (const icon of icons) {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body {
              margin: 0;
              padding: 0;
              width: ${icon.size}px;
              height: ${icon.size}px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: transparent;
            }
            svg {
              width: ${icon.size}px;
              height: ${icon.size}px;
            }
          </style>
        </head>
        <body>
          ${svgContent}
        </body>
      </html>
    `;

    await page.setContent(html);
    await page.setViewport({ width: icon.size, height: icon.size });

    const outputPath = path.join(publicDir, icon.name);
    
    if (icon.name === 'favicon.ico') {
      // For ICO, we'll create a PNG and note that conversion is needed
      await page.screenshot({
        path: outputPath.replace('.ico', '.png'),
        type: 'png',
        omitBackground: true,
      });
      console.log(`Generated ${icon.name.replace('.ico', '.png')} (convert to .ico manually)`);
    } else {
      await page.screenshot({
        path: outputPath,
        type: 'png',
        omitBackground: true,
      });
      console.log(`Generated ${icon.name}`);
    }
  }

  await browser.close();
  console.log('\nAll icons generated successfully!');
  console.log('Note: favicon.ico needs to be converted from PNG manually or use a tool like ImageMagick.');
}

generateIcons().catch(console.error);

