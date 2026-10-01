import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// The public SVG mirrors components/housemate-mascot.tsx in fixed brand colors.
// Generate platform assets from this vector, never from an existing small PNG.
const publicDirectory = new URL('../public/', import.meta.url);
const source = await readFile(new URL('icon.svg', publicDirectory), 'utf8');
const square = source.replace('rx="18" ', '');
// Keep the character and sparkle inside Android's centered maskable safe circle.
const maskable = square.replace('<g ', '<g transform="translate(6.4 6.4) scale(0.8)" ');
for (const [filename, size, svg] of [
  ['icon-192.png', 192, source],
  ['icon-512.png', 512, source],
  ['icon-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, square],
]) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(new URL(filename, publicDirectory), png);
  console.log(`${filename}: ${size}×${size}`);
}
