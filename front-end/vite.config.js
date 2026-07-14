import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Client-exposed env vars use PUBLIC_ instead of Vite's default VITE_ -
  // renamed off VITE_ while chasing an unrelated Vercel dashboard save issue
  // (see front-end/.env.example). Functionally identical either way; Vite
  // only exposes vars matching this prefix to import.meta.env regardless of
  // what the prefix string actually is.
  envPrefix: 'PUBLIC_',
  server: {
    port: 5173,
  },
});
