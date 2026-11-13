import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'fonts/NotoSans-Regular.ttf',
          'fonts/NotoSans-Bold.ttf',
          'fonts/NotoSansDevanagari-Regular.ttf',
          'fonts/NotoSansDevanagari-Bold.ttf',
        ],
        manifest: {
          id: '/',
          name: 'EduPulse AI',
          short_name: 'EduPulse',
          description:
            'Local-first question paper studio for Indian school teachers (CBSE, ICSE, Maharashtra Board).',
          theme_color: '#4338ca',
          background_color: '#fafaf9',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
      dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-router-dom',
        '@radix-ui/react-checkbox',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-popover',
        '@radix-ui/react-progress',
        '@radix-ui/react-radio-group',
        '@radix-ui/react-select',
        '@radix-ui/react-slider',
        '@radix-ui/react-switch',
        '@radix-ui/react-tabs',
        '@radix-ui/react-tooltip',
        'cmdk',
        'clsx',
        'comlink',
        'dexie',
        'dexie-react-hooks',
        'docx',
        'i18next',
        'jszip',
        'lucide-react',
        'mammoth',
        'minisearch',
        'pdf-lib',
        '@pdf-lib/fontkit',
        'pdfjs-dist',
        'react-i18next',
        'tailwind-merge',
        'tesseract.js',
        'three',
        'three/addons/controls/OrbitControls.js',
        'three/addons/environments/RoomEnvironment.js',
        'three/addons/lights/RectAreaLightUniformsLib.js',
        'zod',
        'zustand',
      ],
    },
    worker: {
      format: 'es',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-router')) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/three')) {
              return 'three-vendor';
            }
            if (id.includes('node_modules/dexie')) {
              return 'dexie-vendor';
            }
            if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
              return 'i18n-vendor';
            }
            if (id.includes('node_modules/pdf-lib') || id.includes('node_modules/@pdf-lib')) {
              return 'pdf-export-vendor';
            }
            if (id.includes('node_modules/docx')) {
              return 'docx-export-vendor';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      allowedHosts: true,
    },
  };
});
