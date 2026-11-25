import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Genera favicon, íconos PWA, maskable y apple-touch-icon a partir de public/logo.svg.
// Uso: npm run iconos
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0f5f56' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0f5f56' } },
  },
  images: ['public/logo.svg'],
});
