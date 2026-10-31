/**
 * PWA icon generation (run once with `npm run pwa:icons`; outputs are committed in public/).
 * Source: public/app-icon.png (the emblem from public/logo new.png)
 */
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#14110d' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#14110d' } },
  },
  images: ['public/app-icon.png'],
});
