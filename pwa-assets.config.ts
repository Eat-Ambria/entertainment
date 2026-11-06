/**
 * PWA icon generation (run once with `npm run pwa:icons`; outputs are committed in public/).
 * Source: public/app-icon.png (the emblem from public/logo new.png)
 * The iPhone icon fills the whole tile (iOS rounds the corners); padding on a flat colour showed a
 * square inside it. The maskable icon is rebuilt afterwards by scripts/maskable-icon.mjs.
 */
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    apple: { ...minimal2023Preset.apple, padding: 0 },
  },
  images: ['public/app-icon.png'],
});
