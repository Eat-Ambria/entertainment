/**
 * Builds public/maskable-icon-512x512.png (runs after pwa-assets-generator in `npm run pwa:icons`).
 * The generator pads the emblem onto a flat colour, which leaves a visible square edge. Here the
 * emblem is shrunk into Android's safe zone and its edges fade into black, so no square shows.
 */
import sharp from 'sharp';

const SIZE = 512;
const INNER = Math.round(SIZE * 0.8);

const fade = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${INNER}" height="${INNER}">
    <defs><radialGradient id="g" r="0.5"><stop offset="0.9" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`,
);

const emblem = await sharp('public/app-icon.png')
  .resize(INNER, INNER)
  .composite([{ input: fade, blend: 'dest-in' }])
  .png()
  .toBuffer();

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: '#000000' } })
  .composite([{ input: emblem, gravity: 'center' }])
  .flatten({ background: '#000000' })
  .png()
  .toFile('public/maskable-icon-512x512.png');
