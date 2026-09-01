const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../public/logo.png');
const imgBuffer = fs.readFileSync(srcPath);
const base64Data = imgBuffer.toString('base64');

// The active content is bounding box [minX: 112, maxX: 388, minY: 95, maxY: 416]
// Aspect ratio is 276 / 321.
// Let's create a square viewBox centered on the content with comfortable breathing margin:
// Content center: X = 250, Y = 255. Half-span: 175.
// ViewBox: 75 80 350 350
const squareSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="75 80 350 350" width="100%" height="100%">
  <image href="data:image/png;base64,${base64Data}" x="0" y="0" width="500" height="500" />
</svg>`;

fs.writeFileSync(path.join(__dirname, '../public/favicon.svg'), squareSvg);
fs.writeFileSync(path.join(__dirname, '../src/app/icon.svg'), squareSvg);
console.log('Saved favicon.svg and src/app/icon.svg successfully.');
