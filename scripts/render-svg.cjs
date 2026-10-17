// Renders SVG files to transparent PNGs at a fixed number of pixels per viewBox unit.
//   node scripts/render-svg.cjs <out-dir> <px-per-unit> <file.svg...>
// Needs Playwright (npm install); PLAYWRIGHT_EXECUTABLE_PATH may point at Chrome.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

const [out, scale, ...files] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const page = await browser.newPage();
  for (const file of files) {
    const svg = fs.readFileSync(file, 'utf8');
    const box = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
    const width = Math.round(box[2] * scale), height = Math.round(box[3] * scale);
    const png = await page.evaluate(async ([source, w, h]) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(source)));
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    }, [svg, width, height]);
    fs.writeFileSync(path.join(out, path.basename(file, '.svg') + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  }
  await browser.close();
})();
