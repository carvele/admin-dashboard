import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2015',
    rollupOptions: {
      external: (id) => {
        // Exclude completely in production bundles
        if (id.includes('/dev-utils/')) {
          return true;
        }
        return false;
      },
    },
  },
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.gstatic.com https://www.gstatic.com https://apis.google.com; worker-src 'self' blob:; connect-src 'self' blob: https://wufcmtndotfvxvvxkamv.supabase.co wss://wufcmtndotfvxvvxkamv.supabase.co https://res.cloudinary.com https://api.cloudinary.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io; img-src * 'self' data: blob: https: http:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com",
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.gstatic.com https://www.gstatic.com https://apis.google.com; worker-src 'self' blob:; connect-src 'self' blob: https://wufcmtndotfvxvvxkamv.supabase.co wss://wufcmtndotfvxvvxkamv.supabase.co https://res.cloudinary.com https://api.cloudinary.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io; img-src * 'self' data: blob: https: http:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com",
    },
  },
})
