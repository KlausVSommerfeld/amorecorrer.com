const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

(async () => {
  try {
    const src = 'public/logo-source.png';
    if (!fs.existsSync(src)) {
      console.error(`Source image not found: ${src}`);
      console.error('Place your PNG (the one you attached) at public/logo-source.png and run this script.');
      process.exit(1);
    }

    const sizes = [16, 32, 48, 64];
    const buffers = await Promise.all(
      sizes.map((s) => sharp(src).resize(s, s).png().toBuffer())
    );

    const icoBuffer = await pngToIco(buffers);
    fs.writeFileSync('public/favicon-v2.ico', icoBuffer);

    // also write a 64x64 png copy for testing
    const png64 = await sharp(src).resize(64, 64).png().toBuffer();
    fs.writeFileSync('public/favicon-v2-64.png', png64);

    console.log('Generated public/favicon-v2.ico and public/favicon-v2-64.png');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
