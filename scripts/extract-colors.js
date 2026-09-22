import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360 * 10) / 10, Math.round(s * 1000) / 10, Math.round(l * 1000) / 10];
}

function toHex(rgb) {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function extract(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs);
    process.exit(2);
  }
  try {
    // Use sharp to read and downscale the image, then quantize by simple bucketing
    const img = sharp(abs).resize(64, 64, { fit: 'inside' }).removeAlpha();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const counts = new Map();
    const step = 24; // bucket size
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const kr = Math.round(r / step) * step;
      const kg = Math.round(g / step) * step;
      const kb = Math.round(b / step) * step;
      const key = `${kr}-${kg}-${kb}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 8).map(([k, c]) => {
      const [kr, kg, kb] = k.split('-').map(Number);
      const rgb = [kr, kg, kb].map(v => Math.max(0, Math.min(255, v)));
      return { hex: toHex(rgb), rgb, hsl: rgbToHsl(...rgb), count: c };
    });
    console.log(JSON.stringify(top, null, 2));
  } catch (err) {
    console.error('Error extracting colors:', err);
    process.exit(1);
  }
}

if (process.argv.length < 3) {
  console.error('Usage: node scripts/extract-colors.js <image>');
  process.exit(1);
}

extract(process.argv[2]);
