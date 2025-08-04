// https://nuxt.com/docs/api/configuration/nuxt-config

import tailwindcssVite from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  ssr: false,
  css: ['@/assets/css/main.css', 'highlight.js/styles/atom-one-dark.css'],
  vite: {
    plugins: [
      // Tailwind CSS v4 Vite plugin
      tailwindcssVite(),
    ],
  },
  app: {},
});