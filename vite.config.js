import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Charger la config Firebase depuis les variables d'env
    __firebase_config: JSON.stringify(
      JSON.parse(process.env.VITE_FIREBASE_CONFIG || '{}')
    ),
    __app_id: JSON.stringify(
      process.env.VITE_APP_ID || 'flash-control-v5'
    ),
    __initial_auth_token: JSON.stringify(
      process.env.VITE_INITIAL_AUTH_TOKEN || null
    )
  }
})
