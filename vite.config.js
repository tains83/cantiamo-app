import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Queste variabili verranno lette dalle variabili d'ambiente di Vercel
    __firebase_config: process.env.VITE_FIREBASE_CONFIG || '"{}"',
    __app_id: JSON.stringify(process.env.VITE_APP_ID || 'cantiamo-v3-final'),
    __initial_auth_token: JSON.stringify(process.env.VITE_AUTH_TOKEN || '')
  }
})